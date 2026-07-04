const config = require("../../config.json");
const {TextChannel, ActionRowBuilder, SelectMenuBuilder} = require("discord.js");
const {PermissionFlagsBits, ChannelType} = require("discord-api-types/v10");
let desac = false;

module.exports.run = async(client, message, args) => {
    if (config.owners.includes(message.author.id) && args[0] === "desac") return desac = !desac;
    if (desac) return message.channel.send("Les tickets sont temporairement désactivés probablement dû à une surcharge. Veuillez nous en excuser.");
    if (message.guild.id !== config.serverId) return message.channel.send("Pas de ticket sur ce serveur");

    let target = message.member;
    if (args[0]) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
            return message.reply("Vous n'avez pas la permission d'ouvrir un ticket pour quelqu'un d'autre");
        }
        let targetId = message.mentions.members?.first()?.id || (args[0].match(/^\d+$/) ? args[0] : null);
        if (!targetId) return message.reply("Merci de mentionner un utilisateur ou de donner son ID (ex: `+ticket @Utilisateur` ou `+ticket 123456789012345678`)");
        target = message.guild.members.cache.get(targetId) || await message.guild.members.fetch(targetId).catch(() => null);
        if (!target) return message.reply("Cet utilisateur doit être présent sur le serveur pour lui ouvrir un ticket");
    }
    let openedForSomeoneElse = target.id !== message.author.id;

    message.guild.channels.create({
        name: target.user.username,
        type: ChannelType.GuildText,
        topic: 'Ticket en attente de <@' + target.id+'>',
        permissionOverwrites: [
            {
                id: target.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]
            },
            {
                id: config.serverId,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: config.tickets.roles.staff,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]
            }
        ],
        parent: config.tickets.categoryWait, reason: 'Ticket de ' + target.user.tag + (openedForSomeoneElse ? ' ouvert par ' + message.author.tag : '')
    }).then(async c => {
        if (!c || !c instanceof TextChannel) return message.reply("Désolé, il y'a une erreur quelque part");
        let reasons;

        for (const [key, value] of Object.entries(config.tickets.reasons)) {
            if (!reasons) reasons = "**Veuillez réagir avec un émoji en dessous du message concernant votre demande**\n" + key + " " + value;
            else reasons = reasons.concat("\n" + key + " " + value);
        }
        client.log(openedForSomeoneElse
            ? `Le ticket <#${c.id}> a été ouvert pour ${target.user.tag} par ${message.author.tag}`
            : `Le ticket <#${c.id}> a été ouvert par ${message.author.tag}`, 'gen');
        message.reply(openedForSomeoneElse
            ? `:white_check_mark: Le ticket a été créé pour ${target.user.tag}, <#${c.id}>`
            : `:white_check_mark: Votre Ticket a été créé, <#${c.id}>`); //Send msg in channel of opening

        let options = [];
        for (const [key, value] of Object.entries(config.tickets.reasons)) { //Generate list of options
            options.push({
                label: value,
                value: key
            })
        }
        const row = new ActionRowBuilder()
            .addComponents(
                new SelectMenuBuilder()
                    .setCustomId('select')
                    .setPlaceholder('Choisissez ici le sujet de votre ticket')
                    .addOptions(options),
            );

        let newmsg = await c.send({
            embeds: [{
                title: `**__Nouveau Ticket__**`,
                color: config.color,
                timestamp: new Date(),
                footer: {
                    icon_url: config.imageURL,
                    text: "@Histeria " + new Date().getFullYear()
                },
                fields: [
                    {
                        name: "Sujet du ticket",
                        value: "Veuillez choisir dans le menu en dessous le sujet du ticket"
                    }
                ],
            }],
            components: [row]
        });
        await newmsg.pin().then( () => {c.messages.fetch({ limit: 1 }).then(messages => {messages.first().delete();})});

        const filter = (interaction) => interaction.customId === 'select';
        const collector = newmsg.createMessageComponentCollector({ filter, time: 300000 });
        collector.on('collect', async interaction => {
            collector.stop();
            await interaction.deferUpdate();

            let link = client.commands.get("link");
            let username = await link.getFromDiscordId(client.mysqlingame, target.id);
            let subject = config.tickets.reasons[interaction.values[0]];

            if (!username) {
                await reason(client, newmsg, subject, target.user);
            } else {
                await pseudo(client, newmsg, username.player, subject, target.user);
            }
        });
        collector.on('end', () => {
            if(!newmsg.channel) return;
            if(config.tickets.categoryWait !== newmsg.channel.parent.id) return collector.stop();
            if(collector.collected.size === 0){
                console.log("Ticket of " + target.user.tag + " timeout on open");
                newmsg.channel.send("Absence de plus de 5 minutes, fermeture du ticket dans 5 secondes." +
                    "\nVeuillez réessayer d'ouvrir un ticket et n'oubliez pas de définir le sujet du ticket.");
                require("../../sleep.js")(5000);
                newmsg.channel.delete();
                target.user.send("Nous n'avons pas eu de réponse dans votre ticket depuis 5 minutes que vous n'avez pas finir d'ouvrir, le ticket a été fermé."+
                    "\nVeuillez réessayer d'ouvrir un ticket et n'oubliez pas de définir le sujet du ticket.");
            }
        });
    });
};

async function reason(client, message, reason, author) {
    message.edit({
        embeds: [{
            title: `**__Nouveau Ticket__**`,
            color: config.color,
            timestamp: new Date(),
            footer: {
                icon_url: config.imageURL,
                text: "@Histeria " + new Date().getFullYear()
            },
            fields: [
                {
                    name: "Sujet du ticket",
                    value: reason
                },
                {
                    name: "Pseudo in game",
                    value: "**Veuillez répondre ci-dessous avec votre pseudo en jeu (écrivez . si non-nécessaire)**"
                }
            ],
        }],
        components: []
    });

    let msgpseudo = await message.channel.send('**Veuillez répondre ci-dessous avec votre pseudo en jeu (écrivez . si non-nécessaire)**');
    const collector = message.channel.createMessageCollector({ filter: m => m.content !== "", time: 300000 });
    collector.on('collect', m => {
        if (m.author.id === client.user.id) return;
        if(config.tickets.categoryWait !== message.channel.parent.id) return collector.stop();
        msgpseudo.delete();
        pseudo(client, message, m.content, reason, author);
        collector.stop();
    });
    collector.on('end', collected => {
        if(!message.channel || config.tickets.categoryWait !== message.channel?.parent.id) return;
        if(collected.size === 0){
            message.channel.send("Absence de plus de 5 minutes, fermeture du ticket dans 5 secondes");
            require("../../sleep.js")(5000);
            message.channel.delete();
            author.send("Nous n'avons pas eu de réponse dans le ticket concernant '"+reason+"' que vous n'avez pas finir d'ouvrir pendant 5 minutes, le ticket a été fermé")
                .catch(() => console.log("Impossible de dm le closeur d'un ticket inactif"));
        }
    });
}

async function pseudo(client, message, response, reason, author){
    if(response === "." || !response) response = "Pas de pseudo indiqué";
    response = response.replace('<@', 'TAG_PROTECT');
    //await message.channel.setTopic("2. Ticket ouvert pour " + reason + " par <@" + author.id+"> ("+response+")");
    message.edit({
        embeds: [{
            title: `**__Nouveau Ticket__**`,
            color: config.color,
            timestamp: new Date(),
            footer: {
                icon_url: config.imageURL,
                text: "@Histeria " + new Date().getFullYear()
            },
            fields: [
                {
                    name: "Sujet du ticket",
                    value: reason
                },
                {
                    name: "Pseudo in game",
                    value: response
                },
                {
                    name: "Description approfondie",
                    value: "**Veuillez indiquer une description approfondie du problème, n'hésitez pas à rajouter des documents par la suite ou des liens**"
                }
            ]
        }],
        components: []
    });
    let msgdescription = await message.channel.send("**Veuillez indiquer une description approfondie du problème n'hésitez pas à inclure des liens**");
    const collector = message.channel.createMessageCollector({ filter: m => m.content !== "", time: 300000 });
    collector.on('collect', desc => {
        if (desc.author.id === client.user.id) return;
        if(config.tickets.categoryWait !== message.channel?.parent.id) return collector.stop;
        msgdescription.delete();
        description(message, reason, response, desc, author);
        collector.stop();
    });
    collector.on('end', collected => {
        if(!message.channel || config.tickets.categoryWait !== message.channel?.parent.id) return collector.stop();
        if(collected.size === 0){
            message.channel.send("Absence de plus de 5 minutes, fermeture du ticket dans 5 secondes");
            require("../../sleep.js")(5000);
            message.channel.delete();
            author.send("Nous n'avons pas eu de réponse dans le ticket concernant '"+reason+" que vous n'avez pas finir d'ouvrir pendant 5 minutes, le ticket a été fermé")
                .catch(() => console.log("Impossible de dm le closeur d'un ticket inactif"));
        }
    });
}
async function description(message, reason, pseudo, description, author){
    description.delete();
    let content, categoryid;
    if(description.content === ".") content = "Pas de description indiquée";
    else content = description.content;
    if(content.length > 1023) {
        message.channel.send(content);
        content = "Trop long, envoyé en message";
    }
    categoryid = config.tickets.categoryOpened;
    await message.channel.edit({
        name: reason??"skip",
        topic: "Ticket ouvert pour " + reason + " par <@" + author.id+"> ("+pseudo+")",
        parent: categoryid,
        lockPermissions: false
    }).catch(err => {
        message.channel.send("Nous sommes actuellement surchargé de ticket, par conséquent le ticket restera en création pour une durée indéterminée");
        message.channel.send(err)});
    //if(reason !== "skip") await message.channel.setName(reason)
    message.edit({
        embeds: [{
            title: `**__Nouveau Ticket__**`,
            color: config.color,
            timestamp: new Date(),
            footer: {
                icon_url: config.imageURL,
                text: "@Histeria " + new Date().getFullYear()
            },
            fields: [
                {
                    name: "Sujet du ticket",
                    value: reason
                },
                {
                    name: "Pseudo in game",
                    value: pseudo
                },
                {
                    name: "Description approfondie",
                    value: content
                }
            ],
        }],
        components: []
    });

    description.attachments.forEach(attach => {message.channel.send("Voici un lien d'un attachment probablement mort: "+attach.url);});
}


module.exports.config = {
    name: "new",
    description: "Ouvrir un ticket (le staff peut l'ouvrir pour un joueur via +ticket {ID/@})",
    format: "new [ID/@utilisateur]",
    canBeUseByBot: false,
    alias: ["ticket"],
    category: "Ticket"
};
