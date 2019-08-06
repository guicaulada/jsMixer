isNode = () => {
  return typeof module !== 'undefined' && module.exports
}

if (isNode()) MixerAPI = require('./jsMixer')

class MixerBot extends MixerAPI {
  constructor(clientId, secretOrScopeOrOAuth, scopeOrOAuth) {
    super(clientId, secretOrScopeOrOAuth, scopeOrOAuth)
    this.eventHandlers = {}
    this.commandHandlers = {}
    this.messageHandlers = []
    this.anyEventHandlers = []
    this.prefix = '!'
  }

  addEventHandler(event, handler) {
    if (typeof event === 'function') {
      this.anyEventHandlers.push(event)
    } else if (typeof handler === 'function') {
      if (event.constructor.name === 'Array') {
        for (let e of event) this.eventHandlers[e] = handler
      } else if (event.constructor.name === 'String') {
        this.eventHandlers[event] = handler
      } 
    } else throw new TypeError('Invalid command handler type, expected (String|Array, Function)')
  }

  addCommandHandler(command, handler) {
    if (typeof handler === 'function') {
      if (command.constructor.name === 'Array') {
        for (let cmd of command) this.commandHandlers[cmd] = handler
      } else if (command.constructor.name === 'String') {
        this.commandHandlers[command] = handler
      } else throw new TypeError('Invalid command handler type, expected (String|Array, Function)')
    } else throw new TypeError('Invalid command handler type, expected (String|Array, Function)')
  }

  addMessageHandler(handler) {
    if (typeof handler === 'function') {
      this.messageHandlers.push(handler)
    } else throw new TypeError('Invalid command handler type, expected (Function)')
  }

  async join(channel, chat) {
    chat = await super.join(channel, chat)
    for (let command in this.commandHandlers) {
      chat.addMessageHandler((data) => {
        let text = data.message.message[0].text
        if (text[0] == this.prefix) {
          let args = text.split(/\s+/g)
          let cmd = args.shift()
          cmd = cmd.slice(1, cmd.length)
          if (cmd === command) {
            this.commandHandlers[command](chat, data, args)
          }
        }
      })
    }
    for (let event in this.eventHandlers) {
      chat.addEventHandler(event, (data) => {
        this.eventHandlers[event](chat, data)
      })
    }
    for (let handler of this.anyEventHandlers) {
      chat.addEventHandler((event, data) => {
        handler(chat, event, data)
      })
    }
    for (let handler of this.messageHandlers) {
      chat.addMessageHandler((data) => {
        handler(chat, data)
      })
    }
    return chat
  }
}

if (isNode()) {
  module.exports = MixerBot
}