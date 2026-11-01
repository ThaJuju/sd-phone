--[[
    PATCH MAISON — « Regarder le téléphone » d'un autre joueur (voir PATCHES.md § 8).

    Le serveur ne fait que trois choses : faire accepter la demande par le
    propriétaire (carte AirShare, kind `screen`), tenir les sessions, et relayer le
    flux du propriétaire vers SES spectateurs. Le spectateur n'a aucun chemin vers
    le téléphone du propriétaire : il ne peut qu'arrêter de regarder.

    Le flux est une suite de modifications du DOM (rrweb), sérialisée en JSON par
    le NUI du propriétaire et transmise telle quelle : le serveur n'en lit que la
    taille.
]]

---@type table Réglages de la fonction (configs/screenview.lua).
local cfg    = require 'configs.screenview'
---@type table Cœur AirShare (server.share.core) : demande/acceptation, portée, téléphone sorti.
local share  = require 'server.share.core'
---@type table Helpers serveur (server.util) : enveloppes de refus.
local util   = require 'server.util'

---@type table<number, { viewers: table<number, true>, count: integer, window: integer, bytes: integer }>
local owners  = {}
---@type table<number, number> spectateur -> propriétaire regardé
local watching = {}

local function stopViewer(viewer, reason)
    local owner = watching[viewer]
    if not owner then return end
    watching[viewer] = nil
    TriggerClientEvent('sd-phone:client:screenview:viewStop', viewer, { reason = reason })

    local session = owners[owner]
    if not session then return end
    session.viewers[viewer] = nil
    session.count = session.count - 1
    if session.count <= 0 then
        owners[owner] = nil
        TriggerClientEvent('sd-phone:client:screenview:recordStop', owner)
    else
        TriggerClientEvent('sd-phone:client:screenview:viewers', owner, { count = session.count })
    end
end

local function stopOwner(owner, reason)
    local session = owners[owner]
    if not session then return end
    for viewer in pairs(session.viewers) do stopViewer(viewer, reason) end
end

local function startSession(owner, viewer)
    if not GetPlayerName(viewer) or watching[viewer] then return false end
    if not share.canShareTo(viewer, owner, false) then
        return false, "Vous n'êtes plus assez près, ou le téléphone a été rangé."
    end

    local session = owners[owner]
    if not session then
        session = { viewers = {}, count = 0, window = GetGameTimer(), bytes = 0 }
        owners[owner] = session
    end
    if session.count >= (tonumber(cfg.MaxViewers) or 1) then
        return false, 'Trop de personnes regardent déjà votre écran.'
    end

    session.viewers[viewer] = true
    session.count = session.count + 1
    watching[viewer] = owner

    TriggerClientEvent('sd-phone:client:screenview:viewStart', viewer, { owner = owner })
    TriggerClientEvent('sd-phone:client:screenview:recordStart', owner, {
        viewerName     = share.nameFor(owner, viewer),
        count          = session.count,
        bytesPerSecond = tonumber(cfg.BytesPerSecond) or 160000,
        flushMs        = tonumber(cfg.FlushMs) or 100,
        transferBytesPerSecond = tonumber(cfg.TransferBytesPerSecond) or 2000000,
        maxBatchBytes  = tonumber(cfg.MaxBatchBytes) or 1500000,
    })
    return true
end

-- Appelé à l'acceptation : `target` est le propriétaire du téléphone, la demande a été
-- ouverte par le spectateur (payload.viewer, fixé par le serveur, pas par le client).
share.registerHandler('screen', function(target, payload)
    if not cfg.Enabled then return false, 'Fonction désactivée.' end
    return startSession(target, tonumber(payload and payload.viewer))
end)

lib.callback.register('sd-phone:server:screenview:request', function(src, target)
    if not cfg.Enabled then return util.fail('Fonction désactivée.') end
    target = tonumber(target)
    if not target or target == src or not GetPlayerName(target) then
        return util.fail('Joueur introuvable.')
    end
    if watching[src] then return util.fail('Vous regardez déjà un téléphone.') end
    if owners[target] and owners[target].count >= (tonumber(cfg.MaxViewers) or 1) then
        return util.fail('Trop de personnes regardent déjà ce téléphone.')
    end
    if not share.canShareTo(src, target, false) then
        return util.fail("Cette personne n'a pas son téléphone en main, ou elle est trop loin.")
    end

    local ok, refusal = share.request(src, target, 'screen', { viewer = src })
    if not ok then return refusal or util.fail('Demande impossible.') end
    return { success = true }
end)

-- Arrêt par l'une ou l'autre partie : le spectateur arrête de regarder, le
-- propriétaire coupe tous ses spectateurs.
lib.callback.register('sd-phone:server:screenview:stop', function(src)
    stopViewer(src, 'self')
    stopOwner(src, 'owner')
    return { success = true }
end)

RegisterNetEvent('sd-phone:server:screenview:push', function(data)
    local src = source
    local session = owners[src]
    if not session or type(data) ~= 'string' then return end

    local size = #data
    if size > (tonumber(cfg.MaxBatchBytes) or 1500000) then return end

    -- Plafond de débit vérifié ici aussi : le NUI du propriétaire n'est pas digne de confiance.
    local now = GetGameTimer()
    if now - session.window >= 1000 then
        session.window, session.bytes = now, 0
    end
    session.bytes = session.bytes + size
    local bps = tonumber(cfg.BytesPerSecond) or 160000
    -- Marge d'un état complet de l'écran, qui dépasse à lui seul le débit d'une seconde.
    if session.bytes > bps + (tonumber(cfg.MaxBatchBytes) or 1500000) then return end

    local transfer = tonumber(cfg.TransferBytesPerSecond) or 2000000
    for viewer in pairs(session.viewers) do
        TriggerLatentClientEvent('sd-phone:client:screenview:data', viewer, transfer, data)
    end
end)

-- Portée et téléphone sorti relus en continu : ranger le téléphone ou s'éloigner
-- coupe la session.
CreateThread(function()
    while true do
        Wait(1000)
        for viewer, owner in pairs(watching) do
            if not share.canShareTo(viewer, owner, false) then stopViewer(viewer, 'range') end
        end
    end
end)

AddEventHandler('playerDropped', function()
    local src = source
    stopViewer(src, 'self')
    stopOwner(src, 'dropped')
end)
