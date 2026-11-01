--[[
    PATCH MAISON — « Regarder le téléphone » d'un autre joueur (voir PATCHES.md § 8).

    Un joueur demande à voir l'écran d'un joueur proche dont le téléphone est
    sorti ; celui-ci accepte par la carte AirShare. Le spectateur voit l'écran en
    direct, sans pouvoir y toucher. La portée et la condition « téléphone sorti »
    sont celles d'AirShare (configs/share.lua, `Range`).
]]
return {
    Enabled = true,

    -- Spectateurs simultanés d'un même téléphone.
    MaxViewers = 3,

    -- Débit moyen du flux (octets/s), plafonné côté propriétaire. Au-delà, il saute les
    -- modifications en trop et renvoie un état complet de l'écran dès que le débit le permet.
    BytesPerSecond = 160000,

    -- Vitesse d'envoi des events latents (octets/s), sur chacun des deux trajets
    -- propriétaire → serveur → spectateur. Plus haut que le débit moyen : un état
    -- complet (100 à 300 Ko) doit passer d'un bloc, sinon il retarde tout ce qui suit.
    TransferBytesPerSecond = 2000000,

    -- Taille maximale d'un envoi, état complet de l'écran compris (octets).
    MaxBatchBytes = 1500000,

    -- Intervalle d'envoi des modifications (ms).
    FlushMs = 100,
}
