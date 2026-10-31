--[[
    PATCH MAISON (mainframe) — garde serveur des callbacks sd-phone.

    Lu par server/mainframe_gate.lua, branché dans l'enveloppe centrale de
    lib.callback.register (server/main.lua). Voir PATCHES.md à la racine.

    Pourquoi : en vanilla, le serveur ne vérifie presque jamais que le joueur
    porte un téléphone, et une appli désactivée dans configs/apps.lua garde ses
    callbacks actifs (seule l'icône disparaît). Un exécuteur Lua pouvait donc
    virer de l'argent menotté et sans téléphone, ou utiliser une appli coupée.

    Les correspondances se font par PRÉFIXE du nom de callback, après
    `sd-phone:server:`. Mettre le `:` final quand il faut éviter qu'un préfixe
    en avale un autre (`call:` ne doit pas couvrir `callrec:`).
]]
return {
    -- Callbacks refusés si le joueur n'a pas d'item téléphone sur lui.
    -- Liste volontairement limitée aux actions qui écrivent ou déplacent de
    -- l'argent : les lectures appelées à la connexion (settings, badges, wifi…)
    -- ne doivent pas casser pour un joueur qui n'a pas encore de téléphone.
    -- Les cabines (payphone:*) et la raccroche (call:hangup) restent libres.
    RequirePhone = {
        'banking:', 'games:', 'stocks:', 'ryde:', 'services:', 'marketplace:',
        'pages:', 'messages:', 'mail:', 'birdy:', 'photogram:', 'darkchat:',
        'cherry:', 'vibez:', 'documents:', 'contacts:', 'groups:', 'radio:',
        'weazelnews:', 'garages:', 'homes:', 'racing:', 'photos:', 'albums:',
        'voice:', 'voicemail:', 'callrec:', 'notes:', 'calendar:', 'streaks:',
        'share:', 'airshare:', 'call:dial', 'call:accept', 'call:add',
    },

    -- Préfixe de callback -> id d'appli (configs/apps.lua). Si l'appli est
    -- désactivée, tous ses callbacks sont refusés, qu'on ait un téléphone ou non.
    AppOf = {
        ['banking:']        = 'bank',
        ['stocks:']         = 'stocks',
        ['ryde:']           = 'ryde',
        ['garages:']        = 'garages',
        ['homes:']          = 'homes',
        ['weazelnews:']     = 'weazelnews',
        ['racing:']         = 'racing',
        ['marketplace:']    = 'marketplace',
        ['pages:']          = 'pages',
        ['documents:']      = 'documents',
        ['darkchat:']       = 'darkchat',
        ['cherry:']         = 'cherry',
        ['photogram:']      = 'photogram',
        ['birdy:']          = 'birdy',
        ['vibez:']          = 'vibez',
        ['radio:']          = 'radio',
        ['games:chips']     = 'casino',
        ['games:bj']        = 'casino',
        ['games:baccarat']  = 'casino',
        ['games:crash']     = 'casino',
        ['games:holdem']    = 'casino',
        ['games:roulette']  = 'casino',
        ['games:slots']     = 'casino',
    },

    -- Callbacks refusés à tous, toujours : ils court-circuiteraient la logique
    -- de mainframe. Les jobs sont whitelistés par NOTRE attribution (ESX ne
    -- protège pas SetJob), l'argent société passe par mainframe/societe (journal
    -- society_transactions) et les factures par mainframe/factures.
    -- `services:setDuty` reste permis : sur ESX il ne touche qu'une préférence
    -- du téléphone (recevoir ou non les appels/messages de sa société), jamais
    -- la prise de service de mainframe (c'est mainframe qui la recopie dans
    -- l'interrupteur, cf server/mainframe_duty.lua, et non l'inverse).
    Blocked = {
        'services:hire', 'services:fire', 'services:promote', 'services:demote',
        'services:acceptInvite', 'services:quit', 'services:switchJob',
        'services:removeJob', 'services:deposit', 'services:withdraw',
        'services:invoices:', 'banking:invoices:',
    },
}
