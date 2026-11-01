--[[
    PATCH MAISON — « Regarder le téléphone » d'un autre joueur (voir PATCHES.md § 8).

    Pont entre le serveur (server/auralys_screenview.lua) et le NUI : côté
    propriétaire, le NUI enregistre son écran et ce fichier relaie le flux ; côté
    spectateur, il remet le flux au NUI, qui le rejoue sans aucune interaction.

    exports['sd-phone']:canRequestScreenView(serverId) -> boolean (confort d'affichage)
    exports['sd-phone']:requestScreenView(serverId)
]]

---@type table Réglages de la fonction (configs/screenview.lua).
local cfg   = require 'configs.screenview'
---@type table Portée AirShare (configs/share.lua), revalidée par le serveur.
local share = require 'configs.share'

local viewing = false
local recordBps = 160000

local function notify(description, kind)
    lib.notify({ title = 'Téléphone', description = description, type = kind or 'inform' })
end

local function nearEnough(serverId)
    local player = GetPlayerFromServerId(serverId)
    if player == -1 then return false end
    local ped = GetPlayerPed(player)
    if ped == 0 then return false end
    return #(GetEntityCoords(cache.ped) - GetEntityCoords(ped)) <= (tonumber(share.Range) or 10.0)
end

exports('canRequestScreenView', function(serverId)
    serverId = tonumber(serverId)
    if not cfg.Enabled or viewing or not serverId or serverId == cache.serverId then return false end
    -- `sdPhone` n'est diffusé que pendant que le téléphone est en main (configs/phone.lua,
    -- PropVisibleToOthers) : c'est la seule chose qu'un autre client en sait.
    if not Player(serverId).state.sdPhone then return false end
    return nearEnough(serverId)
end)

exports('requestScreenView', function(serverId)
    local result = lib.callback.await('sd-phone:server:screenview:request', false, tonumber(serverId))
    if type(result) ~= 'table' then return end
    if result.success then
        notify('Demande envoyée. La personne doit accepter sur son téléphone.')
    else
        notify(result.message or 'Demande impossible.', 'error')
    end
end)

-- ── Spectateur ──────────────────────────────────────────────────────────────

local STOP_TEXT = {
    owner   = 'La personne a arrêté de vous montrer son écran.',
    range   = 'Le téléphone a été rangé, ou vous êtes trop loin.',
    dropped = 'La personne s\'est déconnectée.',
}

RegisterNetEvent('sd-phone:client:screenview:viewStart', function()
    viewing = true
    SendNUIMessage({ action = 'sd-phone:screenview:viewStart', data = {} })
    notify('Vous regardez son téléphone. Retour arrière : arrêter.')
end)

RegisterNetEvent('sd-phone:client:screenview:viewStop', function(data)
    if not viewing then return end
    viewing = false
    SendNUIMessage({ action = 'sd-phone:screenview:viewStop', data = {} })
    local text = STOP_TEXT[type(data) == 'table' and data.reason or '']
    if text then notify(text) end
end)

RegisterNetEvent('sd-phone:client:screenview:data', function(data)
    if not viewing or type(data) ~= 'string' then return end
    SendNUIMessage({ action = 'sd-phone:screenview:data', data = { d = data } })
end)

-- Touche (reconfigurable dans Paramètres > Raccourcis clavier > FiveM) ; ne fait
-- rien hors d'une session.
RegisterCommand('sdphone_screenview_stop', function()
    if viewing then lib.callback('sd-phone:server:screenview:stop', false, function() end) end
end, false)
RegisterKeyMapping('sdphone_screenview_stop', 'Arrêter de regarder un téléphone', 'keyboard', 'BACK')

-- ── Propriétaire ────────────────────────────────────────────────────────────

RegisterNetEvent('sd-phone:client:screenview:recordStart', function(data)
    if type(data) ~= 'table' then return end
    recordBps = tonumber(data.bytesPerSecond) or recordBps
    SendNUIMessage({ action = 'sd-phone:screenview:recordStart', data = data })
end)

RegisterNetEvent('sd-phone:client:screenview:viewers', function(data)
    SendNUIMessage({ action = 'sd-phone:screenview:viewers', data = data })
end)

RegisterNetEvent('sd-phone:client:screenview:recordStop', function()
    SendNUIMessage({ action = 'sd-phone:screenview:recordStop', data = {} })
end)

-- Le NUI envoie un lot déjà sérialisé : il traverse le serveur sans être décodé.
RegisterNUICallback('sd-phone:screenview:push', function(payload, cb)
    cb({ ok = true })
    if type(payload) ~= 'table' or type(payload.d) ~= 'string' then return end
    TriggerLatentServerEvent('sd-phone:server:screenview:push', recordBps, payload.d)
end)

RegisterNUICallback('sd-phone:screenview:stop', function(_, cb)
    cb(lib.callback.await('sd-phone:server:screenview:stop', false) or { success = false })
end)
