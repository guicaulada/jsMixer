let MixerAPI = require('..') //jsmixer

const MIXER_TOKEN = process.env.MIXER_TOKEN

let mapi = new MixerAPI(MIXER_TOKEN, ['user:act_as'])

mapi.auth().then(r => console.log(r)).catch(e => console.log(e))
