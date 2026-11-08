-- ID app - the player's identity documents as a stack of cards: a State ID built from the
-- framework's character record, one card per licence they hold, and a job badge. A card can be
-- shown to a nearby phone through AirShare; the recipient sees it for ShareMinutes, then it is gone.
-- Nothing about another player is ever written to disk.
return {
    -- Licence keys that earn a card, as the framework names them in player metadata
    -- (`metadata.licences.driver` on qb/QBox, `user_licenses.type` on ESX where `drive`,
    -- `drive_bike` and `drive_truck` all count as `driver`). A held key missing from this table
    -- is hidden rather than shown with a bare name, so a typo never puts a strange card on a
    -- phone. `color` is the card face; pick something distinct from the State ID's graphite.
    -- PATCH MAISON (mainframe) : avec mainframe, la liste des cartes et leurs libellés viennent de
    -- `Config.Documents.phoneCards` (mainframe/config/documents.lua) ; ici ne compte plus que la
    -- couleur de chaque carte. Les clés sont celles de phoneCards. Voir PATCHES.md § 11.
    Licences = {
        driver   = { label = 'Permis de conduire', color = '#1E5BC6' },
        weapon   = { label = 'Port d\'arme',       color = '#8A1C2B' },
        business = { label = 'Licence commerciale', color = '#0F766E' },
        hunting  = { label = 'Permis de chasse',   color = '#4D7C0F' },
        fishing  = { label = 'Permis de pêche',    color = '#0E7490' },
        boat     = { label = 'Permis bateau',      color = '#0369A1' },
        pilot    = { label = 'Licence de pilote',  color = '#6D28D9' },
    },

    -- Order the licence cards stack in, top to bottom. A held licence not listed here is
    -- appended after these in name order.
    LicenceOrder = { 'driver', 'weapon', 'business', 'hunting', 'fishing', 'boat', 'pilot' },

    -- Card colour per job for the job badge. A job missing here gets a colour derived from its
    -- name, which is stable but arbitrary; add the ones you want to look official.
    JobColors = {
        police    = '#1D4ED8',
        sheriff   = '#92400E',
        ambulance = '#B91C1C',
        doctor    = '#B91C1C',
        lawyer    = '#6D28D9',
        judge     = '#6D28D9',
        mechanic  = '#EA580C',
        taxi      = '#CA8A04',
        realestate = '#0F766E',
    },

    -- The issuing authority printed on every card.
    Issuer = 'État de San Andreas',

    -- How long a card shown to another phone stays viewable on it before it disappears.
    ShareMinutes = 5,
}
