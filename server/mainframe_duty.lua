--[[
    PATCH MAISON (mainframe) — état « En service » de l'appli Services piloté
    de l'extérieur.

    Sur ESX, sd-phone n'a aucun état de service à lire : son interrupteur n'est
    qu'une préférence en base (phone_service_prefs.duty). mainframe l'aligne sur
    sa propre prise de service (menu F6, pointeuses) par l'export ci-dessous.
    Voir PATCHES.md § 6. Ne rien ajouter ici qui dépende de mainframe :
    sd-phone doit démarrer seul.
]]

---@type table Préférences de l'appli Services (server.services.store).
local store   = require 'server.services.store'
---@type table Handlers de l'appli Services (server.services.actions) : notifyRoster.
local actions = require 'server.services.actions'
---@type table Pont joueur (bridge.server.player) : identifiant du personnage.
local player  = require 'bridge.server.player'
---@type table Pont job (bridge.server.job) : job courant.
local job     = require 'bridge.server.job'

---exports['sd-phone']:setServiceDuty(source, on) — bascule l'interrupteur « En service »
---du job COURANT du joueur, sans passer par le NUI. Ne déclenche volontairement pas
---l'event `sd-phone:services:dutyChanged` : c'est l'appelant qui fait autorité, lui
---renvoyer la bascule créerait une boucle.
---@param source number ID serveur du joueur
---@param on boolean
---@return boolean changed true si la préférence a été modifiée
exports('setServiceDuty', function(source, on)
    if type(source) ~= 'number' then return false end
    local cid = player.getIdentifier(source)
    local myJob = job.getName(source)
    if not cid or not myJob then return false end

    on = on == true
    if store.getPrefs(cid, myJob).duty == on then return false end

    store.setDuty(cid, myJob, on)
    TriggerClientEvent('sd-phone:client:services:dutyChanged', source, { job = myJob, duty = on })
    -- L'appli compilée (v1.0.4) n'écoute pas `dutyChanged` : sans ce second push, un
    -- téléphone ouvert sur l'appli Services garderait l'ancien interrupteur affiché.
    -- `jobsChanged` lui fait simplement relire son état.
    TriggerClientEvent('sd-phone:client:services:jobsChanged', source)
    actions.notifyRoster(myJob)
    return true
end)
