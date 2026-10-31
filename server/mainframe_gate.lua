--[[
    PATCH MAISON (mainframe) — garde serveur appliquée à CHAQUE callback sd-phone.

    Appelé depuis l'enveloppe de lib.callback.register (server/main.lua), avant
    le handler d'origine. Règles dans configs/mainframe.lua ; contexte dans
    PATCHES.md. Ne rien ajouter ici qui dépende de mainframe : sd-phone doit
    démarrer seul.
]]

---@type table Règles de la garde (configs/mainframe.lua).
local rules = require 'configs.mainframe'
---@type table Helpers serveur sd-phone : appEnabled, carriesPhone, fail.
local util  = require 'server.util'

local PREFIX = 'sd-phone:server:'

local gate = {}

local function startsWithAny(name, list)
    for i = 1, #list do
        local p = list[i]
        if name:sub(1, #p) == p then return true end
    end
    return false
end

local appPrefixes = {}
for prefix, app in pairs(rules.AppOf or {}) do
    appPrefixes[#appPrefixes + 1] = { prefix = prefix, app = app }
end

---Refus à renvoyer au NUI, ou nil si le callback peut s'exécuter.
---@param name string nom complet du callback
---@param src any premier argument du callback (ID serveur du joueur)
---@return table|nil
function gate.check(name, src)
    if type(name) ~= 'string' or name:sub(1, #PREFIX) ~= PREFIX then return nil end
    local short = name:sub(#PREFIX + 1)

    if startsWithAny(short, rules.Blocked or {}) then
        return util.fail('mainframe.blocked', 'Action indisponible depuis le téléphone.')
    end

    for i = 1, #appPrefixes do
        local entry = appPrefixes[i]
        if short:sub(1, #entry.prefix) == entry.prefix and not util.appEnabled(entry.app) then
            return util.fail('mainframe.appDisabled', 'Cette application est désactivée.')
        end
    end

    if type(src) == 'number' and src > 0 and startsWithAny(short, rules.RequirePhone or {})
        and not util.carriesPhone(src) then
        return util.fail('mainframe.noPhone', 'Vous n\'avez pas de téléphone sur vous.')
    end

    return nil
end

return gate
