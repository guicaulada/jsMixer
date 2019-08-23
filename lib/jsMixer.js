isNode = () => {
  return typeof module !== 'undefined' && module.exports
}

ExtendableProxy = class {
  constructor(getset={}) {
    return new Proxy(this, getset);
  }
}

if (isNode()) MixerChat = require('./jsMixerChat')

class MixerAPI extends ExtendableProxy {
  constructor(clientId, secretOrScopeOrOAuth, scopeOrOAuth) {
    super({
      get: function (mapi, func) {
        if (mapi[func] != null) return mapi[func]
        return function (...params) { return mapi.perform(func, ...params) }
      }
    })
    this.url = 'https://mixer.com/api/'
    this.clientId = clientId
    this.headers = {
      'Client-ID': `${this.clientId}`,
      'Content-Type': `application/json`
    }

    if (scopeOrOAuth) {
      this.secret = secretOrScopeOrOAuth
      this.setOAuthOrScope(scopeOrOAuth)
    } else {
      this.setOAuthOrScope(secretOrScopeOrOAuth)
    }

    this.chats = {}
  }
  
  setOAuthOrScope(OAuthOrScope) {
    if (OAuthOrScope && OAuthOrScope.constructor.name === 'Array') {
      this.scope = OAuthOrScope
    } else if (OAuthOrScope && OAuthOrScope.constructor.name === 'String') {
      if (OAuthOrScope.includes('oauth:')) {
        this.oauth = OAuthOrScope.replace('oauth:', '')
        this.headers['Authorization'] = `Bearer ${this.oauth}`
      } else {
        this.scope = [OAuthOrScope]
      }
    } else {
      throw new TypeError('Invalid scope or oauth, expected String or Array.')
    }
  }

  getExistingToken() {
    let fs = require('fs')
    let path = require('path')
    try {
      return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'refresh_token')))
    } catch (err) {
      return false
    }
  }

  saveToken() {
    let fs = require('fs')
    let path = require('path')
    fs.writeFile(path.join(__dirname, '..', 'refresh_token'), JSON.stringify({
      refresh_token: this.oauth.refresh_token,
      timestamp: (new Date()).getTime(),
      scope: this.scope
    }), () => {})
  }

  async getAuthenticationToken(save=true) {
    let sc = await this.getOAuthShortcode({
      client_id: this.clientId,
      client_secret: this.secret,
      scope: this.scope.join(' ')
    })
    console.log(`jsMixer is trying to authenticate, please visit https://mixer.com/go?code=${sc.code}`)
    let code = false
    while (!code) {
      try {
        let check = await this.checkOAuthShortcode(sc.handle)
        if (!check.code) throw new Error()
        code = check.code
        console.log(`Shortcode authentication successful!`)
        break
      } catch (err) {
        console.log(`Still waiting for authentication, ${sc.expires_in} seconds left...`)
      }
      if (sc.expires_in === 0) {
        console.log('Shortcode authentication failed!')
        process.exit()
      }
      await this.delay(5000)
      sc.expires_in -= 5
    }
    this.oauth = await this.getOAuthToken({
      code: code,
      client_id: this.clientId,
      client_secret: this.secret,
      grant_type: 'authorization_code'
    })
    this.headers['Authorization'] = `${this.oauth.token_type} ${this.oauth.access_token}`
    if (save) this.saveToken()
  }

  async refreshToken(save=true) {
    try {
      this.oauth = await this.getOAuthToken({
        client_id: this.clientId,
        client_secret: this.secret,
        refresh_token: this.oauth.refresh_token,
        grant_type: 'refresh_token'
      })
      this.headers['Authorization'] = `${this.oauth.token_type} ${this.oauth.access_token}`
      if (save) this.saveToken()
    } catch (err) {
      console.error(err)
    }
  }

  delay(t) {
    return new Promise(resolve => setTimeout(resolve, t))
  }

  async auth(save = true) {
    let token = this.getExistingToken()
    let now = (new Date()).getTime()
    if (
      token && 
      !isNaN(token.timestamp) && 
      now - token.timestamp < 365*24*3600*1000 && 
      JSON.stringify(token.scope) == JSON.stringify(this.scope)
    ) {
      this.oauth = {refresh_token: token.refresh_token}
      await this.refreshToken(save)
    } else {
      await this.getAuthenticationToken(save)
    }
    if (this.oauth.expires_in) setInterval(this.refreshToken, (this.oauth.expires_in-300)*1000)
    return this.oauth
  }

  join(channel, chat) {
    return new Promise(async (resolve, reject) => {
      try {
        let user = await this.getCurrentUser()
        let args = [channel.id, user.id]
        if (chat.authkey) args.push(chat.authkey)
        this.chats[channel.id] = new MixerChat(chat.endpoints[0])
        this.chats[channel.token] = this.chats[channel.id]
        this.chats[channel.id].on('open', async () => {
          if (this.chats[channel.id].readyState) {
            try {
              await this.chats[channel.id].auth(...args)
              resolve(this.chats[channel.id])
            } catch (err) {
              console.error(err)
            }
          }
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  send(method, path, params) {
    return new Promise((resolve, reject) =>  {
      let request = isNode() ? require('xmlhttprequest').XMLHttpRequest : XMLHttpRequest
      if (request) {
        let http_request = new request()
        http_request.open(method, this.url+path, true)
        for (let h in this.headers) {
          http_request.setRequestHeader(h, this.headers[h])
        }
        http_request.send(JSON.stringify(params))
        http_request.onreadystatechange = () => {
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
      // /achievements
      getAchievements: [`GET`, `v1/achievements`],
      // /broadcasts
      getCurrentBroadcaster: [`GET`, `v1/broadcasts/current`],
      getBroadcaster: [`GET`, `v1/broadcasts/${params[0]}`],
      getBroadcasterManifest: [`GET`, `v1/broadcasts/${params[0]}/manifest.${params[1]}`],
      // /channels
      getChannels: [`GET`, `v1/channels?${this.serialize(params[0])}`],
      getChannel: [`GET`, `v1/channels/${params[0]}`],
      getChannelDetails: [`GET`, `v1/channels/${params[0]}/details`],
      updateChannel: [`PATCH`, `v1/channels/${params[0]}`, params[1]],
      updateChannel2: [`PUT`, `v1/channels/${params[0]}`, params[1]],
      getChannelViewers: [`GET`, `v1/channels/${params[0]}/analytics/tsdb/viewers?${this.serialize(params[1])}`],
      getChannelViewers2: [`GET`, `v1/channels/${params[0]}/analytics/viewers?${this.serialize(params[1])}`],
      getChannelViewersMetrics: [`GET`, `v1/channels/${params[0]}/analytics/tsdb/viewersMetrics?${this.serialize(params[1])}`],
      getChannelStreamSessions: [`GET`, `v1/channels/${params[0]}/analytics/tsdb/streamSessions?${this.serialize(params[1])}`],
      getChannelStreamHosts: [`GET`, `v1/channels/${params[0]}/analytics/tsdb/streamHosts?${this.serialize(params[1])}`],
      getChannelSubscriptions: [`GET`, `v1/channels/${params[0]}/analytics/tsdb/subscriptions?${this.serialize(params[1])}`],
      getChannelFollowers: [`GET`, `v1/channels/${params[0]}/analytics/tsdb/followers?${this.serialize(params[1])}`],
      getChannelGameRank: [`GET`, `v1/channels/${params[0]}/analytics/tsdb/gameRanksGlobal?${this.serialize(params[1])}`],
      getChannelSubRevenue: [`GET`, `v1/channels/${params[0]}/analytics/tsdb/subRevenue?${this.serialize(params[1])}`],
      getChannelAdRevenue: [`GET`, `v1/channels/${params[0]}/analytics/tsdb/cpm?${this.serialize(params[1])}`],
      getChannelViewerSessionCount: [`GET`, `v1/channels/${params[0]}/analytics/tsdb/viewerSessionCount?${this.serialize(params[1])}`],
      setChannelBadges: [`POST`, `v1/channels/${params[0]}/badge`, params[1]],
      getChannelFollows: [`GET`, `v1/channels/${params[0]}/follow?${this.serialize(params[1])}`],
      followChannel: [`POST`, `v1/channels/${params[0]}/follow`, params[1]],
      followChannel2: [`PUT`, `v1/channels/${params[0]}/follow`, params[1]],
      unfollowChannel: [`DELETE`, `v1/channels/${params[0]}/follow?${this.serialize(params[1])}`],
      getChannelEmoticons: [`GET`, `v1/channels/${params[0]}/emoticons?${this.serialize(params[1])}`],
      updateChannelEmoticos: [`PATCH`, `v1/channels/${params[0]}/emoticons`, params[1]],
      getChannelHostee: [`GET`, `v1/channels/${params[0]}/hostee`],
      setChannelHostee: [`PUT`, `v1/channels/${params[0]}/hostee`, params[1]],
      stopChannelHostee: [`DELETE`, `v1/channels/${params[0]}/hostee`],
      getChannelHosteeLayout: [`GET`, `v1/channels/${params[0]}/hostee/layout`],
      updateChannelHosteeLayout: [`PATCH`, `v1/channels/${params[0]}/hostee/layout`, params[1]],
      getChannelHosters: [`GET`, `v1/channels/${params[0]}/hosters`],
      getChannelLight2Manifest: [`GET`, `v1/channels/${params[0]}/manifest.light2`],
      getChannelM3U8Manifest: [`GET`, `v1/channels/${params[0]}/manifest.m3u8`],
      getChannelFtlManifest: [`GET`, `v1/channels/${params[0]}/manifest.ftl`],
      getChannelPreferences: [`GET`, `v1/channels/${params[0]}/preferences`],
      setChannelPreferences: [`POST`, `v1/channels/${params[0]}/preferences`, params[1]],
      getChannelRelatedChannels: [`GET`, `v1/channels/${params[0]}/related?${this.serialize(params[1])}`],
      resetChannelStreamKey: [`DELETE`, `v1/channels/${params[0]}/streamKey`],
      getChannelRelationship: [`GET`, `v1/channels/${params[0]}/relationship?${this.serialize(params[1])}`],
      setChannelThumbnail: [`POST`, `v1/channels/${params[0]}/thumbnail`, params[1]],
      getChannelUsers: [`GET`, `v1/channels/${params[0]}/users?${this.serialize(params[1])}`],
      getChannelUsersByRole: [`GET`, `v1/channels/${params[0]}/users/${params[1]}?${this.serialize(params[2])}`],
      updateChannelUserRole: [`PATCH`, `v1/channels/${params[0]}/users/${params[1]}`, params[2]],
      getChannelDiscordSettings: [`GET`, `v1/channels/${params[0]}/discord`],
      updateChannelDiscordSettings: [`PUT`, `v1/channels/${params[0]}/discord`, params[1]],
      getChannelDiscordChannels: [`GET`, `v1/channels/${params[0]}/discord/channels`],
      getChannelDiscordRoles: [`GET`, `v1/channels/${params[0]}/discord/roles`],
      checkChannelDiscordInvite: [`GET`, `v1/channels/${params[0]}/discord/invite?${this.serialize(params[1])}`],
      tryChannelDiscordInvite: [`POST`, `v1/channels/${params[0]}/discord/invite?${this.serialize(params[1])}`],
      getChannelRecordings: [`GET`, `v1/channels/${params[0]}/recordings?${this.serialize(params[1])}`],
      unlockChannelTranscodes: [`POST`, `v1/channels/${params[0]}/transcodes/unlock`],
      getChannelConfetti: [`GET`, `v1/channels/${params[0]}/confetti`],
      getChannelBanner: [`GET`, `v1/channels/${params[0]}/banner`],
      setChannelBanner: [`POST`, `v1/channels/${params[0]}/banner`, params[1]],
      deleteChannelBanner: [`DELETE`, `v1/channels/${params[0]}/banner`],
      getChannelBroadcast: [`GET`, `v1/channels/${params[0]}/broadcast?${this.serialize(params[1])}`],
      // /chats
      getChat: [`GET`, `v1/chats/${params[0]}`],
      getChatIfNotBigEvent: [`GET`, `v1/chats/${params[0]}/joinIfNotBigEvent`],
      getChatAnonymously: [`GET`, `v1/chats/${params[0]}/anonymous`],
      getChatFriends: [`GET`, `v1/chats/${params[0]}/friends?${this.serialize(params[1])}`],
      getChatUsers: [`GET`, `v1/chats/${params[0]}/users?${this.serialize(params[1])}`],
      getChatUser: [`GET`, `v1/chats/${params[0]}/users/${params[1]}`],
      searchChatUsers: [`GET`, `v1/chats/${params[0]}/users?${this.serialize(params[1])}`],
      getChatHistory: [`GET`, `v1/chats/${params[0]}/history?${this.serialize(params[1])}`],
      getChatChatters: [`GET`, `v2/chats/${params[0]}/users?${this.serialize(params[1])}`],
      getChatChatter: [`GET`, `v2/chats/${params[0]}/users/${params[1]}`],
      // /clips
      canClip: [`GET`, `v1/clips/broadcasts/${params[0]}/canClip`],
      createClip: [`POST`, `v1/clips/create`, params[0]],
      deleteClip: [`DELETE`, `v1/clips/${params[0]}`],
      getClip: [`GET`, `v1/clips/${params[0]}`],
      updateClip: [`POST`, `v1/clips/${params[0]}/metadata`, params[1]],
      getChannelClips: [`GET`, `v1/clips/channels/${params[0]}`],
      // /confetti
      createConfetti: [`PUT`, `v1/confetti`, params[0]],
      getConfetti: [`GET`, `v1/confetti/${params[0]}`],
      updateConfetti: [`PATCH`, `v1/confetti/${params[0]}`, params[1]],
      deleteConfetti: [`DELETE`, `v1/confetti/${params[0]}`],
      // /costreams
      getCostreams: [`GET`, `v1/costreams/${params[0]}`],
      updateCostream: [`PATCH`, `v1/costreams/${params[0]}`, params[1]],
      deleteCostreamChannel: [`DELETE`, `v1/costreams/${params[0]}/channels/${params[1]}`],
      inviteCostreamChannel: [`POST`, `v1/costreams/invite`, params[0]],
      getCurrentCostream: [`GET`, `v1/costreams/current`],
      leaveCurrentCostream: [`DELETE`, `v1/costreams/current`],
      // /delve
      getDelveHome: [`GET`, `v1/delve/home?${this.serialize(params[0])}`],
      getDelveMixPlayFilters: [`GET`, `v1/delve/mixPlayFilters`],
      getDelveOnlyOnMixer: [`GET`, `v1/delve/onlyOnMixer?${this.serialize(params[0])}`],
      // /frontendVersions
      getFrontendVersions: [`GET`, `v1/frontendVersions?${this.serialize(params[0])}`],
      // /hooks
      getWebhooks: [`GET`, `v1/hooks`],
      createWebhook: [`POST`, `v1/hooks`, params[0]],
      getWebhook: [`GET`, `v1/hooks/${params[0]}`],
      deactivateWebhook: [`POST`, `v1/hooks/${params[0]}/deactivate`],
      renewWebhook: [`POST`, `v1/hooks/${params[0]}/renew`, params[1]],
      // /ingest
      getIngests: [`GET`, `v1/ingests`],
      getBestIngest: [`GET`, `v1/ingests/best`],
      // /interactive
      joinInteractiveGame: [`GET`, `v1/interactive/${params[0]}`],
      getInteractiveHosts: [`GET`, `v1/interactive/hosts`],
      getVnextInteractiveHosts: [`GET`, `v1/interactive/hosts/vnext`],
      getInteractiveGames: [`GET`, `v1/interactive/games?${this.serialize(params[0])}`],
      createInteractiveGame: [`POST`, `v1/interactive/games`, params[0]],
      getInteractiveGame: [`GET`, `v1/interactive/games/${params[0]}`],
      updateInteractiveGame: [`PUT`, `v1/interactive/games/${params[0]}`, params[1]],
      deleteInteractiveGame: [`DELETE`, `v1/interactive/games/${params[0]}`],
      getInteractiveGameVersions: [`GET`, `v1/interactive/games/${params[0]}/versions?${this.serialize(params[1])}`],
      setInteractiveGameCover: [`POST`, `v1/interactive/games/${params[0]}/cover`, params[1]],
      addInteractiveGameEditor: [`POST`, `v1/interactive/games/${params[0]}/editors`, params[1]],
      getInteractiveGameEditors: [`GET`, `v1/interactive/games/${params[0]}/editors`],
      removeInteractiveGameEditor: [`DELETE`, `v1/interactive/games/${params[0]}/editors/${params[1]}`],
      getOwnedInteractiveGames: [`GET`, `v1/interactive/games/owned?${this.serialize(params[0])}`],
      getSharedInteractiveGames: [`GET`, `v1/interactive/games/shared?${this.serialize(params[0])}`],
      getEditorInteractiveGames: [`GET`, `v1/interactive/games/editor?${this.serialize(params[0])}`],
      createInteractiveGameVersion: [`POST`, `v1/interactive/versions`, params[0]],
      getInteractiveGameVersion: [`GET`, `v1/interactive/versions/${params[0]}`],
      updateInteractiveGameVersion: [`PUT`, `v1/interactive/versions/${params[0]}`, params[1]],
      deleteInteractiveGameVersion: [`DELETE`, `v1/interactive/versions/${params[0]}`],
      getInteractiveGamePerformance: [`GET`, `v1/interactive/versions/${params[0]}/analytics/performance?${this.serialize(params[1])}`],
      getInteractiveGameViewersMetrics: [`GET`, `v1/interactive/versions/${params[0]}/analytics/viewersMetrics?${this.serialize(params[1])}`],
      // /invoices
      getInvoice: [`GET`, `v1/invoices/${params[0]}`],
      captureInvoice: [`POST`, `v1/invoices/${params[0]}/capture`, params[1]],
      // /jwt
      getJWTToken: [`POST`, `v1/jwt/authorize`],
      // /language
      getLanguages: [`GET`, `v1/language/channels`],
      getActiveLanguages: [`GET`, `v1/language/channels/active`],
      getAvailableLanguages: [`GET`, `v1/language/channels/available`],
      // /notifications
      getNotification: [`GET`, `v1/notifications/${params[0]}`],
      shareSubAnniversary: [`POST`, `v1/notifications/${params[0]}/shareSub`],
      ignoreSubAnniversary: [`DELETE`, `v1/notifications/${params[0]}/shareSub`],
      answerCostreamInvite: [`POST`, `v1/notifications/${params[0]}/costream/${params[1]}`],
      emailUnsubscribe: [`POST`, `v1/notifications/emailUnsubscribe`, params[0]],
      // /oauth
      revokeOAuthClient: [`DELETE`, `v1/oauth/authorized/${params[0]}`],
      createOAuthClient: [`POST`, `v1/oauth/clients`, params[0]],
      getOAuthClient: [`GET`, `v1/oauth/clients/${params[0]}`],
      updateOAuthClient: [`PUT`, `v1/oauth/clients/${params[0]}`, params[1]],
      deleteOAuthClient: [`DELETE`, `v1/oauth/clients/${params[0]}`],
      setOAuthClientLogo: [`POST`, `v1/oauth/clients/${params[0]}/logo`, params[1]],
      getOAuthToken: [`POST`, `v1/oauth/token`, params[0]],
      getOAuthTokenIntrospect: [`POST`, `v1/oauth/token/introspect`, params[0]],
      getOAuthShortcode: [`POST`, `v1/oauth/shortcode`, params[0]],
      checkOAuthShortcode: [`GET`, `v1/oauth/shortcode/check/${params[0]}`],
      checkTwitterOAuth: [`GET`, `v1/oauth/twitter/check`],
      checkTwitterOAuth2: [`POST`, `v1/oauth/twitter/check`],
      linkTwitterOAuth: [`POST`, `v1/oauth/twitter/link`],
      deleteTwitterLink: [`DELETE`, `v1/oauth/twitter/link`],
      loginTwitter: [`POST`, `v1/oauth/twitter/login`],
      getTwitterProfile: [`GET`, `v1/oauth/twitter/profile`],
      registerTwitterOAuth: [`POST`, `v1/oauth/twitter/register`],
      checkDiscordOAuth: [`GET`, `v1/oauth/discord/check`],
      checkDiscordOAuth2: [`POST`, `v1/oauth/discord/check`],
      linkDiscordOAuth: [`POST`, `v1/oauth/discord/link`],
      deleteDiscordLink: [`DELETE`, `v1/oauth/discord/link`],
      loginDiscord: [`POST`, `v1/oauth/discord/login`],
      getDiscordProfile: [`GET`, `v1/oauth/discord/profile`],
      registerDiscordOAuth: [`POST`, `v1/oauth/discord/register`],
      // /recordings
      getRecordings: [`GET`, `v1/recordings?${this.serialize(params[0])}`],
      getRecording: [`GET`, `v1/recordings/${params[0]}?${this.serialize(params[1])}`],
      updateRecording: [`PATCH`, `v1/recordings/${params[0]}`, params[1]],
      deleteRecording: [`DELETE`, `v1/recordings/${params[0]}`],
      markRecordingAsSeen: [`POST`, `v1/recordings/${params[0]}/seen`, params[1]],
      changeRecordingChatLog: [`PATCH`, `v1/recordings/${params[0]}/chat`, params[1]],
      // /redeemables
      createRedeemable: [`POST`, `v1/redeemables`, params[0]],
      getRedeemable: [`GET`, `v1/redeemables/${params[0]}`],
      redeemRedeemable: [`POST`, `v1/redeemables/redeem`, params[0]],
      // /resources
      getResource: [`GET`, `v1/resources/${params[0]}`],
      deleteResource: [`DELETE`, `v1/resources/${params[0]}`],
      // /seen
      getSeen: [`GET`, `v1/seen/${params[0]}/${params[1]}?${this.serialize(params[2])}`],
      markAsSeen: [`PUT`, `v1/seen/${params[0]}/${params[1]}`, params[2]],
      // /shares
      getShares: [`GET`, `v1/shares/${params[0]}?${this.serialize(params[1])}`],
      createShare: [`POST`, `v1/shares/${params[0]}`, params[1]],
      deleteShare: [`DELETE`, `v1/shares/${params[0]}`, params[1]],
      deleteShareById: [`DELETE`, `v1/shares/${params[0]}/${params[1]}`],
      // /subscriptions
      createSubscription: [`POST`, `v1/subscriptions`, params[0]],
      getSubscription: [`GET`, `v1/subscriptions/${params[0]}`],
      renewSubscription: [`PATCH`, `v1/subscriptions/${params[0]}`, params[1]],
      cancelSubscription: [`DELETE`, `v1/subscriptions/${params[0]}`, params[1]],
      // /suggestions
      getSuggestions: [`GET`, `v1/suggestions/channels?${this.serialize(params[0])}`],
      // /teams
      getTeams: [`GET`, `v1/teams?${this.serialize(params[0])}`],
      createTeam: [`POST`, `v1/teams`, params[0]],
      getTeam: [`GET`, `v1/teams/${params[0]}`],
      updateTeam: [`PUT`, `v1/teams/${params[0]}`, params[1]],
      deleteTeam: [`DELETE`, `v1/teams/${params[0]}`],
      setTeamBackground: [`POST`, `v1/teams/${params[0]}/background`, params[1]],
      setTeamLogo: [`POST`, `v1/teams/${params[0]}/logo`, params[1]],
      setTeamOwner: [`PUT`, `v1/teams/${params[0]}/owner`, params[1]],
      getTeamUsers: [`GET`, `v1/teams/${params[0]}/users?${this.serialize(params[1])}`],
      inviteTeamUser: [`POST`, `v1/teams/${params[0]}/users`, params[1]],
      removeTeamUser: [`DELETE`, `v1/teams/${params[0]}/users/${params[1]}`],
      acceptTeamInvite: [`PUT`, `v1/teams/${params[0]}/users/${params[1]}`],
      // /testStreams
      getChannelTestStreamSettings: [`GET`, `v1/testStreams/${params[0]}`],
      updateChannelTestStreamSettings: [`PUT`, `v1/testStreams/${params[0]}`, params[1]],
      // /transcodes
      getTranscodes: [`GET`, `v1/transcodes`],
      // /types
      getTypes: [`GET`, `v1/types?${this.serialize(params[0])}`],
      lookupTypes: [`GET`, `v1/types/lookup?${this.serialize(params[0])}`],
      getTypesByPublisher: [`GET`, `v1/types/published?${this.serialize(params[0])}`],
      getType: [`GET`, `v1/types/${params[0]}`],
      updateType: [`PUT`, `v1/types/${params[0]}`, params[1]],
      updateTypeThumbnail: [`PUT`, `v1/types/${params[0]}/thumbnail`, params[1]],
      updateTypBackground: [`PUT`, `v1/types/${params[0]}/background`, params[1]],
      getChannelsByType: [`GET`, `v1/types/${params[0]}/channels?${this.serialize(params[1])}`],
      getTypeViewersMetrics: [`GET`, `v1/types/${params[0]}/analytics/viewersMetrics?${this.serialize(params[1])}`],
      getTypeRank: [`GET`, `v1/types/${params[0]}/analytics/rank?${this.serialize(params[1])}`],
      // /users
      getCurrentUser: [`GET`, `v1/users/current`],
      getCurrentUserFrontendVersion: [`GET`, `v1/users/current/frontendVersion`],
      searchUsers: [`GET`, `v1/users/search?${this.serialize(params[0])}`],
      getUser: [`GET`, `v1/users/${params[0]}`],
      updateUser: [`PATCH`, `v1/users/${params[0]}`, params[1]],
      updateUser2: [`PUT`, `v1/users/${params[0]}`, params[1]],
      getUserAchievements: [`GET`, `v1/users/${params[0]}/achievements`],
      getUserAvatar: [`GET`, `v1/users/${params[0]}/avatar?${this.serialize(params[1])}`],
      updateUserAvatar: [`POST`, `v1/users/${params[0]}/avatar`, params[1]],
      deleteUserAvatar: [`DELETE`, `v1/users/${params[0]}/avatar`],
      getUserFollows: [`GET`, `v1/users/${params[0]}/follows?${this.serialize(params[1])}`],
      updateUserFrontendVersion: [`PATCH`, `v1/users/${params[0]}/frontendVersion`, params[1]],
      getUserInvoices: [`GET`, `v1/users/${params[0]}/invoices?${this.serialize(params[1])}`],
      getUserOAuthLink: [`GET`, `v1/users/${params[0]}/links`],
      getUserNotifications: [`GET`, `v1/users/${params[0]}/notifications?${this.serialize(params[1])}`],
      getUserNotificationPreferences: [`GET`, `v1/users/${params[0]}/notifications/preferences`],
      updateUserNotificationPreferences: [`PATCH`, `v1/users/${params[0]}/notifications/preferences`, params[1]],
      getUserOAuthAuthorizations: [`GET`, `v1/users/${params[0]}/oauth/authorized`],
      getUserOAuthClients: [`GET`, `v1/users/${params[0]}/oauth/clients`],
      getUserPreferences: [`GET`, `v1/users/${params[0]}/preferences`],
      setUserPreferences: [`POST`, `v1/users/${params[0]}/preferences`, params[1]],
      getUserRecurringPayments: [`GET`, `v1/users/${params[0]}/recurringPayments?${this.serialize(params[1])}`],
      getUserRedeemables: [`GET`, `v1/users/${params[0]}/redeemables?${this.serialize(params[1])}`],
      getUserResources: [`GET`, `v1/users/${params[0]}/resources`],
      getUserSessions: [`GET`, `v1/users/${params[0]}/sessions`],
      getUserSubscriptions: [`GET`, `v1/users/${params[0]}/subscriptions?${this.serialize(params[1])}`],
      getUserTeams: [`GET`, `v1/users/${params[0]}/teams`],
      getUserTeamsLimit: [`GET`, `v1/users/${params[0]}/teams/limit`],
      setUserPrimaryTeam: [`PUT`, `v1/users/${params[0]}/teams/primary`, params[1]],
      getUserDetails: [`GET`, `v1/users/${params[0]}/details`],
      getUserRecentlyViewedChannels: [`GET`, `v1/users/${params[0]}/recentlyViewedChannels`]
    }

    if (method[action] == undefined) {
      console.error(new Error('Unknown method.'))
      return
    }

    return this.send(...method[action])
  }

  setRequestHeader(header, value) {
    this.headers[header] = value
  }

  serialize(obj) {
    if (obj == null) return ''
    let str = []
    for (let p in obj) {
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
    return str.join('&')
  }
}

if (isNode()) {
  module.exports = MixerAPI
}