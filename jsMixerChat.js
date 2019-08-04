ExtendableProxy = class {
  constructor(getset={}) {
    return new Proxy(this, getset);
  }
}

isNode = () => {
  return typeof module !== 'undefined' && module.exports
}

if (isNode()) WebSocket = require('ws')

class MixerChat extends ExtendableProxy {
  constructor(url) {
    super({
      set: (parent, name, value) => {
        if (parent.ws) return parent.ws[name] = value
        return parent[name] = value
      },
      get: (parent, name1) => {
        if (parent[name1] != null) return parent[name1]
        if (parent.ws[name1] != null) return parent.ws[name1]
        if (parent.methods[name1] != null) return parent.method(name1)
        return new Proxy({}, {
          get: (proxy, name2) => {
            return parent.method(`${name1}:${name2}`)
          }
        })
      }
    })
    this.eventHandlers = {}
    this.replyHandlers = []
    this.anyEventHandlers = []
    this.methods = {
      auth: 0,
      msg: 2,
      whisper: 5,
      'vote:choose': 3,
      'vote:start': 3,
      timeout: 4,
      purge: 5,
      deleteMessage: 10,
      clearMessages: 11,
      history: 1,
      'giveaway:start': 11,
      ping: 12,
      attachEmotes: 12,
      'chat:cancel_skill': 10,
      optOutEvents: 0
    }
    this.ws = new WebSocket(url)
    this.ws.on('message', (message) => {
      let data = JSON.parse(message)
      if (data.type == 'event') {
        this.anyEventHandlers.forEach(async handler => {
          handler(data.event, data.data)
        })
        if (this.eventHandlers[data.event]) {
          this.eventHandlers[data.event].forEach(async handler => {
            handler(data.data)
          })
        }
      } else if (data.type == 'reply') {
        this.replyHandlers.forEach(async handler => {
          if (data.error) handler({error: data.error})
          else handler(data.data)
        })
      }
    })
  }

  addEventHandler(event, func) {
    if (typeof event === 'function') {
      this.anyEventHandlers.push(event)
    } else if (typeof event === 'string' && typeof func === 'function') {
      if (!this.eventHandlers[event]) this.eventHandlers[event] = []
      this.eventHandlers[event].push(func)
    } else {
      throw new TypeError('Invalid type for event handler, expected (string, function) or (function)')
    }
  }

  deleteEventHandler(event, func) {
    if (typeof event === 'function') {
      this.anyEventHandlers.filter(f => f != event)
    } else if (typeof event === 'string' && typeof func === 'function') {
      if (!this.eventHandlers[event]) this.eventHandlers[event] = []
      this.eventHandlers[event].filter(f => f != func)
    } else {
      throw new TypeError('Invalid type for event handler, expected (string, function) or (function)')
    }
  }

  addReplyHandler(func) {
    if (typeof func === 'function') {
      this.replyHandlers.push(func)
    } else {
      throw new TypeError('Invalid type for reply handler, expected (function)')
    }
  }

  deleteReplyHandler(func) {
    if (typeof func === 'function') {
      this.replyHandlers.filter(f => f != func)
    } else {
      throw new TypeError('Invalid type for reply handler, expected (function)')
    }
  }

  addMessageHandler(func) {
    this.addEventHandler('ChatMessage', func)
  }

  deleteMessageHandler(func) {
    this.deleteEventHandler('ChatMessage', func)
  }

  method(method) {
    return (...params) => new Promise((resolve, rejcet) => {
      let data = {
        type: `method`,
        method: method,
        arguments: params,
        id: this.methods[method]
      }
      this.ws.send(JSON.stringify(data))
      let handler = (data) => {
        this.deleteReplyHandler(handler)
        if (data.error) rejcet(data)
        else resolve(data)
      }
      this.addReplyHandler(handler)
    })
  }
}

if (isNode()) {
  module.exports = MixerChat
}