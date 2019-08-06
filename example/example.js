let { MixerAPI } = require('..') //@sighmir/jsmixer

const MIXER_CLIENT = process.env.MIXER_CLIENT
const MIXER_SECRET = process.env.MIXER_SECRET
// const MIXER_OAUTH = process.env.MIXER_OAUTH // Must be prefixed by oauth:
// const MIXER_CLIENT_NO_SECRET = process.env.MIXER_CLIENT_NO_SECRET
// const MIXER_OAUTH_NO_SECRET = process.env.MIXER_OAUTH_NO_SECRET // Must be prefixed by oauth:

let mapi = new MixerAPI(MIXER_CLIENT, MIXER_SECRET, ['chat:connect', 'chat:chat'])

mapi.auth().then(async () => {
  let user = await mapi.getCurrentUser()
  let chat = await mapi.getChat(user.channel.id)
  chat = await mapi.join(user.channel, chat)
  console.log(`Connected to ${user.channel.token}`)
  chat.msg('Hello World!')
  chat.addMessageHandler((data) => {
    console.log(`${data.user_name}: ${data.message.message[0].text}`)
  })
  chat.addEventHandler((event, data) => {
    console.log(event, data)
  })
  chat.addEventHandler('UserJoin', (data) => {
    console.log(data)
  })
  let chatters = await mapi.getChatChatters(user.channel.id)
  console.log('Chatters: ', chatters)
}).catch(e => console.log(e))

// let mapi1 = new MixerAPI(MIXER_CLIENT, MIXER_SECRET, ['user:act_as'])
// let mapi2 = new MixerAPI(MIXER_CLIENT_NO_SECRET, ['user:act_as'])
// let mapi3 = new MixerAPI(MIXER_CLIENT_NO_SECRET, MIXER_OAUTH_NO_SECRET)
// let mapi4 = new MixerAPI(MIXER_CLIENT, MIXER_SECRET, MIXER_OAUTH)

// mapi1.auth().then(async (auth) => {
//   console.log(auth)
//   let user = await mapi1.getCurrentUser()
//   console.log(user)
// }).catch(e => console.log(e))

// mapi2.auth().then(async (auth) => {
//   console.log(auth)
//   let user = await mapi2.getCurrentUser()
//   console.log(user)
// }).catch(e => console.log(e))

// mapi3.getCurrentUser().then(async (user) => {
//   console.log(user)
// }).catch(e => console.log(e))

// mapi4.getCurrentUser().then(async (user) => {
//   console.log(user)
// }).catch(e => console.log(e))