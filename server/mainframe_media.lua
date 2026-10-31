--[[
    PATCH MAISON (mainframe) — fournisseur de médias « mainframe ».

    Actif avec `Provider = 'mainframe'` dans configs/photos.lua. Même contrat
    que server/photos/qbox.lua : `uploadMedia(base64, filename, cb)` rappelle
    `cb(url|nil, err, code)` une seule fois. Le transfert lui-même est fait en
    Node (server/mainframe_upload.js) : décoder du base64 de plusieurs Mo en Lua
    bloquerait le thread serveur. Voir PATCHES.md.
]]

local RESOURCE = GetCurrentResourceName()

-- Au-delà, l'appelant est libéré avec une erreur même si Node n'a jamais répondu.
local TIMEOUT = 90

local media = {}

local waiting = {}
local nextTicket = 0

local function call(name, ...)
    return pcall(function(...) return exports[RESOURCE][name](exports[RESOURCE], ...) end, ...)
end

function media.configured()
    local ok, res = call('mfUploadConfigured')
    return ok and res == true
end

local function settle(ticket, url, err, code)
    local cb = waiting[ticket]
    if not cb then return end
    waiting[ticket] = nil
    cb(url, err, code)
end

AddEventHandler('sd-phone:server:mfupload:done', function(ticket, url, err, code)
    settle(tostring(ticket), url, err, code)
end)

---@param base64Image string data-URL base64 (data:<type>/<sous-type>;base64,...)
---@param _filename string ignoré : le nom est tiré au hasard côté Node
---@param cb fun(url: string|nil, err: string|nil, code: 'no-key'|'bad-data'|'provider'|nil)
function media.uploadMedia(base64Image, _filename, cb)
    if type(base64Image) ~= 'string' or base64Image == '' then
        cb(nil, 'Empty media payload', 'bad-data')
        return
    end

    nextTicket = nextTicket + 1
    local ticket = ('mf%d-%d'):format(os.time(), nextTicket)
    waiting[ticket] = cb

    local ok = call('mfUploadMedia', ticket, base64Image)
    if not ok then
        settle(ticket, nil, 'The media uploader is unavailable on this server', 'provider')
        return
    end

    SetTimeout(TIMEOUT * 1000, function()
        settle(ticket, nil, 'The media host did not answer in time', 'provider')
    end)
end

CreateThread(function()
    Wait(2000)
    local cfg = require 'configs.photos'
    if tostring(cfg.Provider or ''):lower() == 'mainframe' and not media.configured() then
        print('^3[sd-phone]^0 Provider = \'mainframe\' mais convars phone_image_* absentes ou incomplètes : aucune photo, vidéo ni note vocale ne sera enregistrée.')
    end
end)

return media
