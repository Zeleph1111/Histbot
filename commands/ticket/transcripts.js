const config = require('../../config.json');
const {PermissionFlagsBits} = require("discord-api-types/v10");
const {ActionRowBuilder, ButtonBuilder, ButtonStyle} = require("discord.js");

const PAGE_SIZE = 10;

module.exports.run = async(client, message, args) => {
    // Fix: .mentions.users.first() renvoie un objet User, pas un ID -> il faut .mentions.members
    let target = message.mentions.members?.first();
    if(!target) target = message.guild.members.cache.get(args[0]);

    let callback = function(err, results) {
        if (err) {
            console.error(err);
            return message.reply("Une erreur est survenue lors de la récupération des transcripts.");
        }
        sendResults(message, results);
    };

    if(!args[0]){
        client.mysqldiscord.execute('SELECT * FROM `transcripts` WHERE userid = ?', [message.author.id], callback);
    } else {
        if(message.member.permissions.has(PermissionFlagsBits.ManageMessages) && [config.serverId, config.staffServerId].includes(message.guild.id)) {
            if(target){
                client.mysqldiscord.execute('SELECT * FROM `transcripts` WHERE userid = ?', [target.id], callback);
            } else if(args[0].match(/^\d+$/g)){
                client.mysqldiscord.execute('SELECT * FROM `transcripts` WHERE userid = ?', [args[0]], callback);
            } else if(args[0] === 'name') {
                if (!args[1]) return message.reply('Il manque le nom de la personne ciblée');
                client.mysqldiscord.execute('SELECT * FROM `transcripts` WHERE username = ?', [args[1]], callback);
            } else {
                return message.reply("Argument invalide. Utilisez une mention, un ID, ou `name <pseudo>`");
            }
        } else return message.reply("Vous n'avez pas la permission");
    }
};

function buildPayload(message, results, page, totalPages, mentionId)
{
    // Le mentionId vient toujours de la BDD (results[0].userid), jamais d'une variable
    // qui pourrait être undefined -> fix du bug "Transcripts de <@undefined>"
    let who;
    if(message.author.id === mentionId) who = 'Vos transcripts';
    else who = 'Transcripts de <@'+mentionId+'> ('+results[0].name+')';

    let start = page * PAGE_SIZE;
    let pageResults = results.slice(start, start + PAGE_SIZE);
    let content = pageResults.map(r => `${r.name} [${r.id}](https://transcripts.histeria.fr/${r.id})`).join('\n');
    if(!content) content = 'Aucun transcript sur cette page';

    let d = new Date();
    let payload = {
        embeds: [{
            title: `**__Transcripts__**` + (totalPages > 1 ? ` (page ${page + 1}/${totalPages})` : ''),
            color: config.color,
            timestamp: d,
            footer: {
                icon_url: config.imageURL,
                text: "@Histeria " + d.getFullYear()
            },
            fields: [
                {
                    name: who,
                    value: content
                }
            ],
        }]
    };
    if(totalPages > 1) payload.components = [buildRow(page, totalPages)];
    return payload;
}

function buildRow(page, totalPages)
{
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('transcripts_prev').setLabel('◀ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId('transcripts_next').setLabel('Suivant ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1)
    );
}

async function sendResults(message, results)
{
    if(!results[0]) return message.channel.send('Aucun résultat trouvé');

    let mentionId = results[0].userid;
    let totalPages = Math.ceil(results.length / PAGE_SIZE);
    let page = 0;

    message.author.send(buildPayload(message, results, page, totalPages, mentionId))
        .then(async sentMsg => {
            message.reply('Je vous ai envoyé le résultat en DM');
            if(totalPages <= 1) return;

            const filter = i => i.user.id === message.author.id && ['transcripts_prev', 'transcripts_next'].includes(i.customId);
            const collector = sentMsg.createMessageComponentCollector({filter, time: 300000});

            collector.on('collect', async interaction => {
                if(interaction.customId === 'transcripts_prev' && page > 0) page--;
                if(interaction.customId === 'transcripts_next' && page < totalPages - 1) page++;
                await interaction.update(buildPayload(message, results, page, totalPages, mentionId));
            });

            collector.on('end', () => {
                sentMsg.edit({components: []}).catch(() => {});
            });
        })
        .catch(() => message.reply("Je n'arrive pas à vous envoyer de message, assurez vous d'autoriser les messages privés avec au moins un serveur en commun avec moi"));
}

module.exports.config = {
    name: "transcripts",
    description: "Voir la liste de ses tickets",
    format: "transcripts [user/'name'] [pseudo/'force']",
    canBeUseByBot: false,
    category: "Ticket"
};
