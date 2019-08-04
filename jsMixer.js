isNode = () => {
  return typeof module !== 'undefined' && module.exports
}

ExtendableProxy = class {
  constructor(getset={}) {
    return new Proxy(this, getset);
  }
}

class MixerAPI extends ExtendableProxy {
  constructor(clientId, secretOrScopeOrOAuth, scopeOrOAuth) {
    super({
      get: function (mapi, func) {
        if (mapi[func] != null) return mapi[func]
        return function (...params) { return mapi.perform(func, ...params) }
      }
    })
    this.url = 'https://mixer.com/api/v1'
    this.clientId = clientId
    this.headers = {
      'Client-ID': `${this.clientId}`,
    }

    if (scopeOrOAuth) {
      this.secret = secretOrScopeOrOAuth
      this.setOAuthOrScope(scopeOrOAuth)
    } else {
      this.setOAuthOrScope(secretOrScopeOrOAuth)
    }
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

  delay(t) {
    return new Promise(resolve => setTimeout(resolve, t))
  }

  async shortcodeAuth() {
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
      sc.expires_in-=5
    }
    this.oauth = await this.getOAuthToken({
      code: code,
      client_id: this.clientId,
      client_secret: this.secret,
      grant_type: 'authorization_code'
    })
    this.headers['Authorization'] = `${this.oauth.token_type} ${this.oauth.access_token}`
    setInterval(async () => {
      try {
        this.oauth = await this.getOAuthToken({
          client_id: this.clientId,
          client_secret: this.secret,
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
      getAchievements: [`GET`, `/achievements`],
      // /broadcasts
      getCurrentBroadcaster: [`GET`, `/broadcasts/current`],
      getBroadcaster: [`GET`, `/broadcasts/${params[0]}`],
      getBroadcasterManifest: [`GET`, `/broadcasts/${params[0]}/manifest.${params[1]}`],
      // /channels
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
      getChannelUsersByRole: [`GET`, `/channels/${params[0]}/users/${params[1]}?${this.serialize(params[2])}`],
      updateChannelUserRole: [`PATCH`, `/channels/${params[0]}/users/${params[1]}`, params[2]],
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
      // /chats
      getChat: [`GET`, `/chats/${params[0]}`],
      getChatIfNotBigEvent: [`GET`, `/chats/${params[0]}/joinIfNotBigEvent`],
      getChatAnonymously: [`GET`, `/chats/${params[0]}/anonymous`],
      getChatFriends: [`GET`, `/chats/${params[0]}/friends?${this.serialize(params[1])}`],
      getChatHistory: [`GET`, `/chats/${params[0]}/history?${this.serialize(params[1])}`],
      // /clips
      canClip: [`GET`, `/clips/broadcasts/${params[0]}/canClip`],
      createClip: [`POST`, `/clips/create`, params[0]],
      deleteClip: [`DELETE`, `/clips/${params[0]}`],
      getClip: [`GET`, `/clips/${params[0]}`],
      updateClip: [`POST`, `/clips/${params[0]}/metadata`, params[1]],
      getChannelClips: [`GET`, `/clips/channels/${params[0]}`],
      // /confetti
      createConfetti: [`PUT`, `/confetti`, params[0]],
      getConfetti: [`GET`, `/confetti/${params[0]}`],
      updateConfetti: [`PATCH`, `/confetti/${params[0]}`, params[1]],
      deleteConfetti: [`DELETE`, `/confetti/${params[0]}`],
      // /costreams
      getCostreams: [`GET`, `/costreams/${params[0]}`],
      updateCostream: [`PATCH`, `/costreams/${params[0]}`, params[1]],
      deleteCostreamChannel: [`DELETE`, `/costreams/${params[0]}/channels/${params[1]}`],
      inviteCostreamChannel: [`POST`, `/costreams/invite`, params[0]],
      getCurrentCostream: [`GET`, `/costreams/current`],
      leaveCurrentCostream: [`DELETE`, `/costreams/current`],
      // /delve
      getDelveHome: [`GET`, `/delve/home?${this.serialize(params[0])}`],
      getDelveMixPlayFilters: [`GET`, `/delve/mixPlayFilters`],
      getDelveOnlyOnMixer: [`GET`, `/delve/onlyOnMixer?${this.serialize(params[0])}`],
      // /frontendVersions
      getFrontendVersions: [`GET`, `/frontendVersions?${this.serialize(params[0])}`],
      // /hooks
      getWebhooks: [`GET`, `/hooks`],
      createWebhook: [`POST`, `/hooks`, params[0]],
      getWebhook: [`GET`, `/hooks/${params[0]}`],
      deactivateWebhook: [`POST`, `/hooks/${params[0]}/deactivate`],
      renewWebhook: [`POST`, `/hooks/${params[0]}/renew`, params[1]],
      // /ingest
      getIngests: [`GET`, `/ingests`],
      getBestIngest: [`GET`, `/ingests/best`],
      // /interactive
      joinInteractiveGame: [`GET`, `/interactive/${params[0]}`],
      getInteractiveHosts: [`GET`, `/interactive/hosts`],
      getVnextInteractiveHosts: [`GET`, `/interactive/hosts/vnext`],
      getInteractiveGames: [`GET`, `/interactive/games?${this.serialize(params[0])}`],
      createInteractiveGame: [`POST`, `/interactive/games`, params[0]],
      getInteractiveGame: [`GET`, `/interactive/games/${params[0]}`],
      updateInteractiveGame: [`PUT`, `/interactive/games/${params[0]}`, params[1]],
      deleteInteractiveGame: [`DELETE`, `/interactive/games/${params[0]}`],
      getInteractiveGameVersions: [`GET`, `/interactive/games/${params[0]}/versions?${this.serialize(params[1])}`],
      setInteractiveGameCover: [`POST`, `/interactive/games/${params[0]}/cover`, params[1]],
      addInteractiveGameEditor: [`POST`, `/interactive/games/${params[0]}/editors`, params[1]],
      getInteractiveGameEditors: [`GET`, `/interactive/games/${params[0]}/editors`],
      removeInteractiveGameEditor: [`DELETE`, `/interactive/games/${params[0]}/editors/${params[1]}`],
      getOwnedInteractiveGames: [`GET`, `/interactive/games/owned?${this.serialize(params[0])}`],
      getSharedInteractiveGames: [`GET`, `/interactive/games/shared?${this.serialize(params[0])}`],
      getEditorInteractiveGames: [`GET`, `/interactive/games/editor?${this.serialize(params[0])}`],
      createInteractiveGameVersion: [`POST`, `/interactive/versions`, params[0]],
      getInteractiveGameVersion: [`GET`, `/interactive/versions/${params[0]}`],
      updateInteractiveGameVersion: [`PUT`, `/interactive/versions/${params[0]}`, params[1]],
      deleteInteractiveGameVersion: [`DELETE`, `/interactive/versions/${params[0]}`],
      getInteractiveGamePerformance: [`GET`, `/interactive/versions/${params[0]}/analytics/performance?${this.serialize(params[1])}`],
      getInteractiveGameViewersMetrics: [`GET`, `/interactive/versions/${params[0]}/analytics/viewersMetrics?${this.serialize(params[1])}`],
      // /invoices
      getInvoice: [`GET`, `/invoices/${params[0]}`],
      captureInvoice: [`POST`, `/invoices/${params[0]}/capture`, params[1]],
      // /jwt
      getJWTToken: [`POST`, `/jwt/authorize`],
      // /language
      getLanguages: [`GET`, `/language/channels`],
      getActiveLanguages: [`GET`, `/language/channels/active`],
      getAvailableLanguages: [`GET`, `/language/channels/available`],
      // /notifications
      getNotification: [`GET`, `/notifications/${params[0]}`],
      shareSubAnniversary: [`POST`, `/notifications/${params[0]}/shareSub`],
      ignoreSubAnniversary: [`DELETE`, `/notifications/${params[0]}/shareSub`],
      answerCostreamInvite: [`POST`, `/notifications/${params[0]}/costream/${params[1]}`],
      emailUnsubscribe: [`POST`, `/notifications/emailUnsubscribe`, params[0]],
      // /oauth
      revokeOAuthClient: [`DELETE`, `/oauth/authorized/${params[0]}`],
      createOAuthClient: [`POST`, `/oauth/clients`, params[0]],
      getOAuthClient: [`GET`, `/oauth/clients/${params[0]}`],
      updateOAuthClient: [`PUT`, `/oauth/clients/${params[0]}`, params[1]],
      deleteOAuthClient: [`DELETE`, `/oauth/clients/${params[0]}`],
      setOAuthClientLogo: [`POST`, `/oauth/clients/${params[0]}/logo`, params[1]],
      getOAuthToken: [`POST`, `/oauth/token`, params[0]],
      getOAuthTokenIntrospect: [`POST`, `/oauth/token/introspect`, params[0]],
      getOAuthShortcode: [`POST`, `/oauth/shortcode`, params[0]],
      checkOAuthShortcode: [`GET`, `/oauth/shortcode/check/${params[0]}`],
      checkTwitterOAuth: [`GET`, `/oauth/twitter/check`],
      checkTwitterOAuth2: [`POST`, `/oauth/twitter/check`],
      linkTwitterOAuth: [`POST`, `/oauth/twitter/link`],
      deleteTwitterLink: [`DELETE`, `/oauth/twitter/link`],
      loginTwitter: [`POST`, `/oauth/twitter/login`],
      getTwitterProfile: [`GET`, `/oauth/twitter/profile`],
      registerTwitterOAuth: [`POST`, `/oauth/twitter/register`],
      checkDiscordOAuth: [`GET`, `/oauth/discord/check`],
      checkDiscordOAuth2: [`POST`, `/oauth/discord/check`],
      linkDiscordOAuth: [`POST`, `/oauth/discord/link`],
      deleteDiscordLink: [`DELETE`, `/oauth/discord/link`],
      loginDiscord: [`POST`, `/oauth/discord/login`],
      getDiscordProfile: [`GET`, `/oauth/discord/profile`],
      registerDiscordOAuth: [`POST`, `/oauth/discord/register`],
      // /recordings
      getRecordings: [`GET`, `/recordings?${this.serialize(params[0])}`],
      getRecording: [`GET`, `/recordings/${params[0]}?${this.serialize(params[1])}`],
      updateRecording: [`PATCH`, `/recordings/${params[0]}`, params[1]],
      deleteRecording: [`DELETE`, `/recordings/${params[0]}`],
      markRecordingAsSeen: [`POST`, `/recordings/${params[0]}/seen`, params[1]],
      changeRecordingChatLog: [`PATCH`, `/recordings/${params[0]}/chat`, params[1]],
      // /redeemables
      createRedeemable: [`POST`, `/redeemables`, params[0]],
      getRedeemable: [`GET`, `/redeemables/${params[0]}`],
      redeemRedeemable: [`POST`, `/redeemables/redeem`, params[0]],
      // /resources
      getResource: [`GET`, `/resources/${params[0]}`],
      deleteResource: [`DELETE`, `/resources/${params[0]}`],
      // /seen
      getSeen: [`GET`, `/seen/${params[0]}/${params[1]}?${this.serialize(params[2])}`],
      markAsSeen: [`PUT`, `/seen/${params[0]}/${params[1]}`, params[2]],
      // /shares
      getShares: [`GET`, `/shares/${params[0]}?${this.serialize(params[1])}`],
      createShare: [`POST`, `/shares/${params[0]}`, params[1]],
      deleteShare: [`DELETE`, `/shares/${params[0]}`, params[1]],
      deleteShareById: [`DELETE`, `/shares/${params[0]}/${params[1]}`],
      // /subscriptions
      createSubscription: [`POST`, `/subscriptions`, params[0]],
      getSubscription: [`GET`, `/subscriptions/${params[0]}`],
      renewSubscription: [`PATCH`, `/subscriptions/${params[0]}`, params[1]],
      cancelSubscription: [`DELETE`, `/subscriptions/${params[0]}`, params[1]],
      // /suggestions
      getSuggestions: [`GET`, `/suggestions/channels?${this.serialize(params[0])}`],
      // /teams
      getTeams: [`GET`, `/teams?${this.serialize(params[0])}`],
      createTeam: [`POST`, `/teams`, params[0]],
      getTeam: [`GET`, `/teams/${params[0]}`],
      updateTeam: [`PUT`, `/teams/${params[0]}`, params[1]],
      deleteTeam: [`DELETE`, `/teams/${params[0]}`],
      setTeamBackground: [`POST`, `/teams/${params[0]}/background`, params[1]],
      setTeamLogo: [`POST`, `/teams/${params[0]}/logo`, params[1]],
      setTeamOwner: [`PUT`, `/teams/${params[0]}/owner`, params[1]],
      getTeamUsers: [`GET`, `/teams/${params[0]}/users?${this.serialize(params[1])}`],
      inviteTeamUser: [`POST`, `/teams/${params[0]}/users`, params[1]],
      removeTeamUser: [`DELETE`, `/teams/${params[0]}/users/${params[1]}`],
      acceptTeamInvite: [`PUT`, `/teams/${params[0]}/users/${params[1]}`],
      // /testStreams
      getChannelTestStreamSettings: [`GET`, `/testStreams/${params[0]}`],
      updateChannelTestStreamSettings: [`PUT`, `/testStreams/${params[0]}`, params[1]],
      // /transcodes
      getTranscodes: [`GET`, `/transcodes`],
      // /types
      getTypes: [`GET`, `/types?${this.serialize(params[0])}`],
      lookupTypes: [`GET`, `/types/lookup?${this.serialize(params[0])}`],
      getTypesByPublisher: [`GET`, `/types/published?${this.serialize(params[0])}`],
      getType: [`GET`, `/types/${params[0]}`],
      updateType: [`PUT`, `/types/${params[0]}`, params[1]],
      updateTypeThumbnail: [`PUT`, `/types/${params[0]}/thumbnail`, params[1]],
      updateTypBackground: [`PUT`, `/types/${params[0]}/background`, params[1]],
      getChannelsByType: [`GET`, `/types/${params[0]}/channels?${this.serialize(params[1])}`],
      getTypeViewersMetrics: [`GET`, `/types/${params[0]}/analytics/viewersMetrics?${this.serialize(params[1])}`],
      getTypeRank: [`GET`, `/types/${params[0]}/analytics/rank?${this.serialize(params[1])}`],
      // /users
      getCurrentUser: [`GET`, `/users/current`],
      getCurrentUserFrontendVersion: [`GET`, `/users/current/frontendVersion`],
      searchUsers: [`GET`, `/users/search?${this.serialize(params[0])}`],
      getUser: [`GET`, `/users/${params[0]}`],
      updateUser: [`PATCH`, `/users/${params[0]}`, params[1]],
      getUserAchievements: [`GET`, `/users/${params[0]}/achievements`],
      getUserAvatar: [`GET`, `/users/${params[0]}/avatar?${this.serialize(params[1])}`],
      updateUserAvatar: [`POST`, `/users/${params[0]}/avatar`, params[1]],
      deleteUserAvatar: [`DELETE`, `/users/${params[0]}/avatar`],
      getUserFollows: [`GET`, `/users/${params[0]}/follows?${this.serialize(params[1])}`],
      updateUserFrontendVersion: [`PATCH`, `/users/${params[0]}/frontendVersion`, params[1]],
      getUserInvoices: [`GET`, `/users/${params[0]}/invoices?${this.serialize(params[1])}`],
      getUserOAuthLink: [`GET`, `/users/${params[0]}/links`],
      getUserNotifications: [`GET`, `/users/${params[0]}/notifications?${this.serialize(params[1])}`],
      getUserNotificationPreferences: [`GET`, `/users/${params[0]}/notifications/preferences`],
      updateUserNotificationPreferences: [`PATCH`, `/users/${params[0]}/notifications/preferences`, params[1]],
      getUserOAuthAuthorizations: [`GET`, `/users/${params[0]}/oauth/authorized`],
      getUserOAuthClients: [`GET`, `/users/${params[0]}/oauth/clients`],
      getUserPreferences: [`GET`, `/users/${params[0]}/preferences`],
      setUserPreferences: [`POST`, `/users/${params[0]}/preferences`, params[1]],
      getUserRecurringPayments: [`GET`, `/users/${params[0]}/recurringPayments?${this.serialize(params[1])}`],
      getUserRedeemables: [`GET`, `/users/${params[0]}/redeemables?${this.serialize(params[1])}`],
      getUserResources: [`GET`, `/users/${params[0]}/resources`],
      getUserSessions: [`GET`, `/users/${params[0]}/sessions`],
      getUserSubscriptions: [`GET`, `/users/${params[0]}/subscriptions?${this.serialize(params[1])}`],
      getUserTeams: [`GET`, `/users/${params[0]}/teams`],
      getUserTeamsLimit: [`GET`, `/users/${params[0]}/teams/limit`],
      setUserPrimaryTeam: [`PUT`, `/users/${params[0]}/teams/primary`, params[1]],
      getUserDetails: [`GET`, `/users/${params[0]}/details`],
      getUserRecentlyViewedChannels: [`GET`, `/users/${params[0]}/recentlyViewedChannels`]
    }

    if (method[action] == undefined) {
      console.log('Unknown method.')
      return
    }

    return this.send(...method[action])
  }

  setRequestHeader(header, value) {
    this.headers[header] = value
  }

  serialize(obj) {
    if (obj == null) return ""
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
    return str.join("&")
  }
}

if (isNode()) {
  module.exports = MixerAPI
}