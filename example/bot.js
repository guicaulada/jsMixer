let { MixerBot } = require('..') //@sighmir/jsmixer

const MIXER_CLIENT = process.env.MIXER_CLIENT
const MIXER_SECRET = process.env.MIXER_SECRET

let mbot = new MixerBot(MIXER_CLIENT, MIXER_SECRET, ['chat:connect', 'chat:chat'])

mbot.addMessageHandler((chat, data) => {
  console.log(`${data.user_name}: ${data.message.message[0].text}`)
})
mbot.addEventHandler((chat, event, data) => {
  console.log(chat)
  console.log(event, data)
})
mbot.addEventHandler('UserJoin', (chat, data) => {
  console.log(data)
})

mbot.auth().then(async () => {
  let user = await mbot.getCurrentUser()
  let chat = await mbot.getChat(user.channel.id)
  await mbot.join(user.channel, chat)
  console.log(`Connected to ${user.channel.token}`)
  mbot.chats[user.channel.token].msg('Hello World!')
  let chatters = await mbot.getChatChatters(user.channel.id)
  console.log('Chatters: ', chatters)
}).catch(e => console.log(e))