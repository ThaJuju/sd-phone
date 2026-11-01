--[[
    PATCH MAISON — identité de données du téléphone pour les ressources externes
    (voir PATCHES.md § 9).

    Avec les téléphones uniques, les données appartiennent à l'objet téléphone et
    non au personnage : une appli externe (Snapmatic) qui range ses comptes par
    identifiant ESX afficherait au voleur SES propres données. Elle doit utiliser
    l'identité du téléphone actif, la même que sd-phone utilise pour ses applis.
    Sans téléphones uniques, cette identité est l'identifiant du personnage.
]]

---@type table Pont joueur (bridge.server.player), enveloppé par server/sim quand les téléphones uniques sont actifs.
local player = require 'bridge.server.player'

---exports['sd-phone']:getPhoneIdentity(source) — identité de données du téléphone
---actif du joueur, nil s'il n'en a pas.
---@param source number
---@return string|nil
exports('getPhoneIdentity', function(source)
    if type(source) ~= 'number' then return nil end
    return player.getIdentifier(source)
end)

---exports['sd-phone']:getSourceByPhoneIdentity(identity) — joueur connecté dont le
---téléphone ACTIF porte cette identité (un téléphone dans la poche ne compte pas : ses
---données s'afficheront à sa prochaine ouverture), nil sinon.
---@param identity string
---@return number|nil
exports('getSourceByPhoneIdentity', function(identity)
    if type(identity) ~= 'string' or identity == '' then return nil end
    return player.getSourceByIdentifier(identity)
end)
