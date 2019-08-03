function isNode() {
  return typeof module !== 'undefined' && module.exports
}

class ExtendableProxy {
  constructor(getset={}) {
    return new Proxy(this, getset);
  }
}

class MixerAPI extends ExtendableProxy {
  constructor(clientId, secretOrScope, scope) {
    super({
      get: function (mapi, func) {
        if (mapi[func] != null) return mapi[func]
        return function (...params) { return mapi.perform(func, ...params) }
      }
    })
    this.clientId = clientId
    if (scope) {
      this.scopes = scope
      this.secret = secretOrScope
    } else {
      this.scope = secretOrScope
    }
    this.url = 'https://mixer.com/api/v1'
    this.headers = {
      'Client-ID': `${this.clientId}`,
    }
  }

  delay(t) {
    return new Promise(resolve => setTimeout(resolve, t))
  }

  async oauth() {
    let o = { client_id: this.clientId, scope: this.scope.join(' ') }
    if (this.secret) o.client_secret = this.secret
    let sc = await this.getOAuthShortcode(o)
    console.log(`jsMixer is trying to authenticate, please visit https://mixer.com/go?code=${sc.code}`)
    let code = false
    while (!code) {
      try {
        let check = await this.checkOAuthShortcode(sc.handle)
        if (!check.code) throw new Error()
        code = check.code
        console.log(`Shortcode authentication successful!`)
      } catch (err) {
        console.log(`Still waiting for authentication, ${sc.expires_in} seconds left...`)
      }
      if (sc.expires_in === 0) {
        console.log('Shortcode authentication failed!')
        process.exit()
      }
      await this.delay(2000)
      sc.expires_in-=2
    }
    this.oauth = await this.getOAuthToken({
      client_id: this.clientId,
      code: code,
      grant_type: 'authorization_code'
    })
    this.headers['Authorization'] = `${this.oauth.token_type} ${this.oauth.access_token}`
    setInterval(async () => {
      try {
        this.oauth = await this.getOAuthToken({
          client_id: this.clientId,
          refresh_token: this.oauth.refresh_token,
          grant_type: 'refresh_token'
        })
        this.headers['Authorization'] = `${this.oauth.token_type} ${this.oauth.access_token}`
        console.log('jsMixer refreshed the authorization token before it expired!')
      } catch(err) {
        console.log(err)
      }
    }, (this.oauth.expires_in-300)*1000)
    return this.oauth
  }

  send(method, path, params) {
    var self = this
    return new Promise(function (resolve, reject) {
      var request = false
      if (isNode()) {
        request = require('xmlhttprequest').XMLHttpRequest
      } else {
        request = XMLHttpRequest
      }
      if (request) {
        var http_request = new request()
        http_request.open(method, self.url+path, true)
        for (var h in self.headers) {
          http_request.setRequestHeader(h, self.headers[h])
        }
        http_request.send(JSON.stringify(params))
        http_request.onreadystatechange = function () {
          if (http_request.readyState == 4) {
            if (Number(http_request.status.toString()[0]) == 2) {
              try {
                resolve(JSON.parse(http_request.responseText))
              } catch {
                resolve(http_request.responseText)
              }
            } else {
              try {
                reject(JSON.parse(http_request.responseText))
              } catch {
                reject(http_request.responseText)
              }
            }
          }
        }
      } else {
        reject('There was a problem importing the XMLHttpRequest class.')
      }
    })
  }

  perform(action, ...params) {
    const method = {
      // Authentication
      getOAuthShortcode: [`POST`, `/oauth/shortcode`, params[0]],
      checkOAuthShortcode: [`GET`, `/oauth/shortcode/check/${params[0]}`],
      getOAuthToken: [`POST`, `/oauth/token`, params[0]],
      // Achievements
      getAchievements: [`GET`, `/achievements`],
      // Broadcasts
      getCurrentBroadcaster: [`GET`, `/broadcasts/current`],
      getBroadcaster: [`GET`, `/broadcasts/${params[0]}`],
      getBroadcasterManifest: [`GET`, `/broadcasts/${params[0]}/manifest.${params[1]}`],
      // Channels
      getChannels: [`GET`, `/channels?${this.serialize(params[0])}`],
      getChannel: [`GET`, `/channels/${params[0]}`],
      getChannelDetails: [`GET`, `/channels/${params[0]}/details`],
      updateChannel: [`PATCH`, `/channels/${params[0]}`, params[1]],
      getChannelViewers: [`GET`, `/channels/${params[0]}/analytics/tsdb/viewers?${this.serialize(params[1])}`],
      getChannelViewersMetrics: [`GET`, `/channels/${params[0]}/analytics/tsdb/viewersMetrics?${this.serialize(params[1])}`],
      getChannelStreamSessions: [`GET`, `/channels/${params[0]}/analytics/tsdb/streamSessions?${this.serialize(params[1])}`],
      getChannelStreamHosts: [`GET`, `/channels/${params[0]}/analytics/tsdb/streamHosts?${this.serialize(params[1])}`],
      getChannelSubscriptions: [`GET`, `/channels/${params[0]}/analytics/tsdb/subscriptions?${this.serialize(params[1])}`],
      getChannelFollowers: [`GET`, `/channels/${params[0]}/analytics/tsdb/followers?${this.serialize(params[1])}`],
      getChannelGameRank: [`GET`, `/channels/${params[0]}/analytics/tsdb/gameRanksGlobal?${this.serialize(params[1])}`],
      getChannelSubRevenue: [`GET`, `/channels/${params[0]}/analytics/tsdb/subRevenue?${this.serialize(params[1])}`],
      getChannelAdRevenue: [`GET`, `/channels/${params[0]}/analytics/tsdb/cpm?${this.serialize(params[1])}`],
      getChannelViewerSessionCount: [`GET`, `/channels/${params[0]}/analytics/tsdb/viewerSessionCount?${this.serialize(params[1])}`],
      setChannelBadges: [`POST`, `/channels/${params[0]}/badge`, params[1]],
      getChannelFollows: [`GET`, `/channels/${params[0]}/follow?${this.serialize(params[1])}`],
      followChannel: [`POST`, `/channels/${params[0]}/follow`, params[1]],
      unfollowChannel: [`DELETE`, `/channels/${params[0]}/follow?${this.serialize(params[1])}`],
      getChannelEmoticons: [`GET`, `/channels/${params[0]}/emoticons?${this.serialize(params[1])}`],
      updateChannelEmoticos: [`PATCH`, `/channels/${params[0]}/emoticons`, params[1]],
      getChannelHostee: [`GET`, `/channels/${params[0]}/hostee`],
      setChannelHostee: [`PUT`, `/channels/${params[0]}/hostee`, params[1]],
      stopChannelHostee: [`DELETE`, `/channels/${params[0]}/hostee`],
      getChannelHosteeLayout: [`GET`, `/channels/${params[0]}/hostee/layout`],
      updateChannelHosteeLayout: [`PATCH`, `/channels/${params[0]}/hostee/layout`, params[1]],
      getChannelHosters: [`GET`, `/channels/${params[0]}/hosters`],
      getChannelLight2Manifest: [`GET`, `/channels/${params[0]}/manifest.light2`],
      getChannelM3U8Manifest: [`GET`, `/channels/${params[0]}/manifest.m3u8`],
      getChannelFtlManifest: [`GET`, `/channels/${params[0]}/manifest.ftl`],
      getChannelPreferences: [`GET`, `/channels/${params[0]}/preferences`],
      setChannelPreferences: [`POST`, `/channels/${params[0]}/preferences`, params[1]],
      getChannelRelatedChannels: [`GET`, `/channels/${params[0]}/related?${this.serialize(params[1])}`],
      resetChannelStreamKey: [`DELETE`, `/channels/${params[0]}/streamKey`],
      getChannelRelationship: [`GET`, `/channels/${params[0]}/relationship?${this.serialize(params[1])}`],
      setChannelThumbnail: [`POST`, `/channels/${params[0]}/thumbnail`, params[1]],
      getChannelUsers: [`GET`, `/channels/${params[0]}/users?${this.serialize(params[1])}`],
      getChannelUsersByRole: [`GET`, `/channels/${params[0]}/users/${params[0]}?${this.serialize(params[1])}`],
      updateChannelUserRole: [`PATCH`, `/channels/${params[0]}/users/${params[0]}`, params[1]],
      getChannelDiscordSettings: [`GET`, `/channels/${params[0]}/discord`],
      updateChannelDiscordSettings: [`PUT`, `/channels/${params[0]}/discord`, params[1]],
      getChannelDiscordChannels: [`GET`, `/channels/${params[0]}/discord/channels`],
      getChannelDiscordRoles: [`GET`, `/channels/${params[0]}/discord/roles`],
      checkChannelDiscordInvite: [`GET`, `/channels/${params[0]}/discord/invite?${this.serialize(params[1])}`],
      tryChannelDiscordInvite: [`POST`, `/channels/${params[0]}/discord/invite?${this.serialize(params[1])}`],
      getChannelRecordings: [`GET`, `/channels/${params[0]}/recordings?${this.serialize(params[1])}`],
      unlockChannelTranscodes: [`POST`, `/channels/${params[0]}/transcodes/unlock`],
      getChannelConfetti: [`GET`, `/channels/${params[0]}/confetti`],
      getChannelBanner: [`GET`, `/channels/${params[0]}/banner`],
      setChannelBanner: [`POST`, `/channels/${params[0]}/banner`, params[1]],
      deleteChannelBanner: [`DELETE`, `/channels/${params[0]}/banner`],
      getChannelBroadcast: [`GET`, `/channels/${params[0]}/broadcast?${this.serialize(params[1])}`],
      // Chats
      joinChat: [`GET`, `/chats/${params[0]}`],
      joinIfNotBigEvent: [`GET`, `/chats/${params[0]}/joinIfNotBigEvent`],
      joinChatAnonymously: [`GET`, `/chats/${params[0]}/anonymous`],
      getChatFriends: [`GET`, `/chats/${params[0]}/friends?${this.serialize(params[1])}`],
      getChatHistory: [`GET`, `/chats/${params[0]}/history?${this.serialize(params[1])}`],
      // Clips
      canClip: [`GET`, `/clips/broadcasts/${params[0]}/canClip`],
      createClip: [`POST`, `/clips/create`, params[1]],
      deleteClip: [`DELETE`, `/clips/${params[0]}`],
      getClip: [`GET`, `/clips/${params[0]}`],
      updateClip: [`POST`, `/clips/${params[0]}/metadata`, params[1]],
      getChannelClips: [`GET`, `/clips/channels/${params[0]}`],
      // Confetti
      func: [`PUT`, `/confetti`, params[1]],
      func: [`GET`, `/confetti/${params[0]}`],
      func: [`PATCH`, `/confetti/${params[0]}`, params[1]],
      func: [`DELETE`, `/confetti/${params[0]}`],
      // Costreams
      func: [`GET`, `/costreams/${params[0]}`],
      func: [`PATCH`, `/costreams/${params[0]}`, params[1]],
      func: [`DELETE`, `/costreams/${params[0]}/channels/${params[0]}`],
      func: [`POST`, `/costreams/invite`, params[1]],
      func: [`GET`, `/costreams/current`],
      func: [`DELETE`, `/costreams/current`],
      // Delve
      func: [`GET`, `/delve/home`],
      func: [`GET`, `/delve/mixPlayFilters`],
      func: [`GET`, `/delve/onlyOnMixer`],
      // Frontend
      func: [`GET`, `/frontendVersions`],
      // Hooks
      func: [`GET`, `/hooks`],
      func: [`POST`, `/hooks`, params[1]],
      func: [`GET`, `/hooks/${params[0]}`],
      func: [`POST`, `/hooks/${params[0]}/deactivate`, params[1]],
      func: [`POST`, `/hooks/${params[0]}/renew`, params[1]],
      // Ingest
      func: [`GET`, `/ingests`],
      func: [`GET`, `/ingests/best`],
      // Interactive
      func: [`GET`, `/interactive/${params[0]}`],
      func: [`GET`, `/interactive/hosts`],
      func: [`GET`, `/interactive/hosts/vnext`],
      func: [`GET`, `/interactive/games`],
      func: [`POST`, `/interactive/games`, params[1]],
      func: [`GET`, `/interactive/games/${params[0]}`],
      func: [`PUT`, `/interactive/games/${params[0]}`, params[1]],
      func: [`DELETE`, `/interactive/games/${params[0]}`],
      func: [`GET`, `/interactive/games/${params[0]}/versions`],
      func: [`POST`, `/interactive/games/${params[0]}/cover`, params[1]],
      func: [`POST`, `/interactive/games/${params[0]}/editors`, params[1]],
      func: [`GET`, `/interactive/games/${params[0]}/editors`],
      func: [`DELETE`, `/interactive/games/${params[0]}/editors/${params[0]}`],
      func: [`GET`, `/interactive/games/owned`],
      func: [`GET`, `/interactive/games/shared`],
      func: [`GET`, `/interactive/games/editor`],
      func: [`POST`, `/interactive/versions`, params[1]],
      func: [`GET`, `/interactive/versions/${params[0]}`],
      func: [`PUT`, `/interactive/versions/${params[0]}`, params[1]],
      func: [`DELETE`, `/interactive/versions/${params[0]}`],
      func: [`GET`, `/interactive/versions/${params[0]}/analytics/performance`],
      func: [`GET`, `/interactive/versions/${params[0]}/analytics/viewersMetrics`],
      // Invoices
      func: [`GET`, `/invoices/${params[0]}`],
      func: [`POST`, `/invoices/${params[0]}/capture`, params[1]],
      // jwt
      func: [`POST`, `/jwt/authorize`, params[1]],
      // Language
      func: [`GET`, `/language/channels`],
      func: [`GET`, `/language/channels/active`],
      func: [`GET`, `/language/channels/available`],
      // Notifications
      func: [`GET`, `/notifications/${params[0]}`],
      func: [`POST`, `/notifications/${params[0]}/shareSub`, params[1]],
      func: [`DELETE`, `/notifications/${params[0]}/shareSub`],
      func: [`POST`, `/notifications/${params[0]}/costream/${params[0]}`, params[1]],
      func: [`POST`, `/notifications/emailUnsubscribe`, params[1]],
      // OAuth
      func: [`DELETE`, `/oauth/authorized/${params[0]}`],
      func: [`POST`, `/oauth/clients`, params[1]],
      func: [`GET`, `/oauth/clients/${params[0]}`],
      func: [`PUT`, `/oauth/clients/${params[0]}`, params[1]],
      func: [`DELETE`, `/oauth/clients/${params[0]}`],
      func: [`POST`, `/oauth/clients/${params[0]}/logo`, params[1]],
      func: [`POST`, `/oauth/token`, params[1]],
      func: [`POST`, `/oauth/token/introspect`, params[1]],
      func: [`POST`, `/oauth/shortcode`, params[1]],
      func: [`GET`, `/oauth/shortcode/check/${params[0]}`],
      func: [`GET`, `/oauth/twitter/check`],
      func: [`POST`, `/oauth/twitter/check`, params[1]],
      func: [`POST`, `/oauth/twitter/link`, params[1]],
      func: [`DELETE`, `/oauth/twitter/link`],
      func: [`POST`, `/oauth/twitter/login`, params[1]],
      func: [`GET`, `/oauth/twitter/profile`],
      func: [`POST`, `/oauth/twitter/register`, params[1]],
      func: [`GET`, `/oauth/discord/check`],
      func: [`POST`, `/oauth/discord/check`, params[1]],
      func: [`POST`, `/oauth/discord/link`, params[1]],
      func: [`DELETE`, `/oauth/discord/link`],
      func: [`POST`, `/oauth/discord/login`, params[1]],
      func: [`GET`, `/oauth/discord/profile`],
      func: [`POST`, `/oauth/discord/register`, params[1]],
      // Recordings
      func: [`GET`, `/recordings`],
      func: [`GET`, `/recordings/${params[0]}`],
      func: [`PATCH`, `/recordings/${params[0]}`, params[1]],
      func: [`DELETE`, `/recordings/${params[0]}`],
      func: [`POST`, `/recordings/${params[0]}/seen`, params[1]],
      func: [`PATCH`, `/recordings/${params[0]}/chat`, params[1]],
      // Redeemables
      func: [`POST`, `/redeemables`, params[1]],
      func: [`GET`, `/redeemables/${params[0]}`],
      func: [`POST`, `/redeemables/redeem`, params[1]],
      // Resources
      func: [`GET`, `/resources/${params[0]}`],
      func: [`DELETE`, `/resources/${params[0]}`],
      // Seen
      func: [`GET`, `/seen/${params[0]}/${params[0]}`],
      func: [`PUT`, `/seen/${params[0]}/${params[0]}`, params[1]],
      // Shares
      func: [`GET`, `/shares/${params[0]}`],
      func: [`POST`, `/shares/${params[0]}`, params[1]],
      func: [`DELETE`, `/shares/${params[0]}`],
      func: [`DELETE`, `/shares/${params[0]}/${params[0]}`],
      // Subscriptions
      func: [`POST`, `/subscriptions`, params[1]],
      func: [`GET`, `/subscriptions/${params[0]}`],
      func: [`PATCH`, `/subscriptions/${params[0]}`, params[1]],
      func: [`DELETE`, `/subscriptions/${params[0]}`],
      // Suggestions
      func: [`GET`, `/suggestions/channels`],
      // Teams
      func: [`GET`, `/teams`],
      func: [`POST`, `/teams`, params[1]],
      func: [`GET`, `/teams/${params[0]}`],
      func: [`PUT`, `/teams/${params[0]}`, params[1]],
      func: [`DELETE`, `/teams/${params[0]}`],
      func: [`POST`, `/teams/${params[0]}/background`, params[1]],
      func: [`POST`, `/teams/${params[0]}/logo`, params[1]],
      func: [`PUT`, `/teams/${params[0]}/owner`, params[1]],
      func: [`GET`, `/teams/${params[0]}/users`],
      func: [`POST`, `/teams/${params[0]}/users`, params[1]],
      func: [`DELETE`, `/teams/${params[0]}/users/${params[0]}`],
      func: [`PUT`, `/teams/${params[0]}/users/${params[0]}`, params[1]],
      // Test Streams
      func: [`GET`, `/testStreams/${params[0]}`],
      func: [`PUT`, `/testStreams/${params[0]}`, params[1]],
      func: [`GET`, `/transcodes`],
      // Types
      func: [`GET`, `/types`],
      func: [`GET`, `/types/lookup`],
      func: [`GET`, `/types/published`],
      func: [`GET`, `/types/${params[0]}`],
      func: [`PUT`, `/types/${params[0]}`, params[1]],
      func: [`PUT`, `/types/${params[0]}/thumbnail`, params[1]],
      func: [`PUT`, `/types/${params[0]}/background`, params[1]],
      func: [`GET`, `/types/${params[0]}/channels`],
      func: [`GET`, `/types/${params[0]}/analytics/viewersMetrics`],
      func: [`GET`, `/types/${params[0]}/analytics/rank`],
      // Users
      func: [`GET`, `/users/current`],
      func: [`GET`, `/users/current/frontendVersion`],
      func: [`GET`, `/users/search`],
      func: [`GET`, `/users/${params[0]}`],
      func: [`PATCH`, `/users/${params[0]}`, params[1]],
      func: [`GET`, `/users/${params[0]}/achievements`],
      func: [`GET`, `/users/${params[0]}/avatar`],
      func: [`POST`, `/users/${params[0]}/avatar`, params[1]],
      func: [`DELETE`, `/users/${params[0]}/avatar`],
      func: [`GET`, `/users/${params[0]}/follows`],
      func: [`PATCH`, `/users/${params[0]}/frontendVersion`, params[1]],
      func: [`GET`, `/users/${params[0]}/invoices`],
      func: [`GET`, `/users/${params[0]}/links`],
      func: [`GET`, `/users/${params[0]}/notifications`],
      func: [`GET`, `/users/${params[0]}/notifications/preferences`],
      func: [`PATCH`, `/users/${params[0]}/notifications/preferences`, params[1]],
      func: [`GET`, `/users/${params[0]}/oauth/authorized`],
      func: [`GET`, `/users/${params[0]}/oauth/clients`],
      func: [`GET`, `/users/${params[0]}/preferences`],
      func: [`POST`, `/users/${params[0]}/preferences`, params[1]],
      func: [`GET`, `/users/${params[0]}/recurringPayments`],
      func: [`GET`, `/users/${params[0]}/redeemables`],
      func: [`GET`, `/users/${params[0]}/resources`],
      func: [`GET`, `/users/${params[0]}/sessions`],
      func: [`GET`, `/users/${params[0]}/subscriptions`],
      func: [`GET`, `/users/${params[0]}/teams`],
      func: [`GET`, `/users/${params[0]}/teams/limit`],
      func: [`PUT`, `/users/${params[0]}/teams/primary`, params[1]],
      func: [`GET`, `/users/${params[0]}/details`],
      func: [`GET`, `/users/${params[0]}/recentlyViewedChannels`]
    }

    if (method[action] == undefined) {
      console.log('Unknown method.')
      return
    }

    return this.send(...method[action])
  }

  setRequestHeader(header, value) {
    self.headers[header] = value
  }

  serialize(obj) {
    var str = []
    for (var p in obj) {
      if (obj.hasOwnProperty(p)) {
        if (obj[p].constructor.name == 'Array') {
          for (let e of obj[p]) {
            str.push(encodeURIComponent(p) + '=' + encodeURIComponent(e))
          }
        } else {
          str.push(encodeURIComponent(p) + '=' + encodeURIComponent(obj[p]))
        }
      }
    }
    return str.join("&")
  }
}

if (isNode()) {
  module.exports = MixerAPI
}