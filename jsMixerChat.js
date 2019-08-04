ExtendableProxy = class {
  constructor(getset={}) {
    return new Proxy(this, getset);
  }
}

isNode = () => {
  return typeof module !== 'undefined' && module.exports
}

if (isNode()) WebSocket = require('websocket').w3cwebsocket;

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
    this.events = [
      'WelcomeEvent', 
      'ChatMessage', 
      'UserJoin', 
      'UserLeave', 
      'PollStart', 
      'PollEnd', 
      'DeleteMessage',
      'PurgeMessage',
      'ClearMessage',
      'UserUpdate',
      'UserTimeout',
      'SkillAttribution',
      'DeleteSkillAttribution'
    ]
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
    this.ws.onmessage = (message) => {
      let data = JSON.parse(message.data)
      if (data.type == 'event') {
        this.anyEventHandlers.forEach(async handler => {
          handler(data.data)
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
    }
  }

  addEventHandler(event, func) {
    if (typeof event === 'function') {
      this.anyEventHandlers.push(func)
    }
    if (!this.eventHandlers[event]) this.eventHandlers[event] = []
    this.eventHandlers[event].push(func)
  }

  deleteEventHandler(event, func) {
    if (typeof event === 'function') {
      this.anyEventHandlers.filter(f => f != func)
    }
    if (!this.eventHandlers[event]) this.eventHandlers[event] = []
    this.eventHandlers[event].filter(f => f != func)
  }

  addReplyHandler(func) {
    this.replyHandlers.push(func)
  }

  deleteReplyHandler(func) {
    this.replyHandlers.filter(f => f != func)
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