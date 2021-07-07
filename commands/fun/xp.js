const config = require('../../config.json')

module.exports.run = async(client, message, args) => {
    let target = message.guild.member(message.mentions.users.first());
    if(!target && args[0]) target = message.guild.member(args[0]);
    if(!target) target = message.member;
    const d = new Date();
    let full = client.xpapi.getFull(target.id);
    if(!full) return message.reply('Utilisateur non trouvé');

    message.reply({
        embed: {
            title: `Statistiques de **${target.displayName}**`,
            color: config.color,
            timestamp: d,
            footer: {
                icon_url: config.image_url,
                text: "@Histeria "+d.getFullYear()
            },
            fields: [
                {
                    name: 'Level',
                    value: `${full.lvl}`,
                    inline: true
                },
                {
                    name: 'XP',
                    value: `${full.xp} / ${5 * (full.lvl * full.lvl) + 80 * full.lvl + 100}`,
                    inline: true
                },
                {
                    name: 'Rank',
                    value: `឵឵${await client.xpapi.getRank(target.id)}`,
                    inline: true
                },
            ]
        }
    })
};

module.exports.config = {
    name: "xp",
    description: "Récupérer votre xp ou celle d'un membre sur le discord",
    format: "+xp <utilisateur>",
    canBeUseByBot: false,
    category: "Fun"
};