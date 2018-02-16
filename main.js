'use strict';

// Imports dependencies and set up http server
const
  express = require('express'),
  request = require('request'),
  bodyParser = require('body-parser'),
  async = require('async'),
  botometer = require('node-botometer'),
  Twitter = require('twitter'),
  getBearerToken = require('get-twitter-bearer-token'),
  mcache = require('memory-cache'),
  app = express().use(bodyParser.json()); // creates express http server

// Sets server port and logs message on success
const server = app.listen(process.env.PORT || 1337, () => console.log('server is launched'));
server.timeout = 0;

const twitter_consumer_key = '7FCkRJ5B5pA5WdVc8taFqSkMH'
const twitter_consumer_secret = 'bgK8NV9oCj7CPuczKHySvk177DBzYFflP4BuW4DgItTvgRvdD5'
const twitter_access_token_key = '950378405337350144-8cKAr0MnDlxQgLPeOYDY9r7CTbmjijW'
const twitter_access_token_secret = 'K9xGx6AhKB7o3NpnIvGe5PxKBwLP9DUORvDmQwgmy99Ys'

const cache_duration = 2592000;

let client = new Twitter({
      consumer_key: twitter_consumer_key,
      consumer_secret: twitter_consumer_secret,
      access_token_key: twitter_access_token_key,
      access_token_secret: twitter_access_token_secret
});

const B = new botometer({
  consumer_key: twitter_consumer_key,
  consumer_secret: twitter_consumer_secret,
  access_token: null,
  access_token_secret: null,
  app_only_auth: true,
  mashape_key: 'GhALQRqDbHmshcQXZhatEYKsScyBp1STVehjsno98Aa0hsXUqI',
  rate_limit: 0,
  log_progress: true,
  include_user: true,
  include_timeline: false,
  include_mentions: false
});

app.get("/botometer", function(request, response) {
    let target = request.query.search_for;
    let profile = request.query.profile;
    let names = new Array();
    let key = target + ':' + profile
    let cachedKey = mcache.get(key)

    console.log('Request ' + target + ' for ' + profile);
    if (typeof target === 'undefined' || typeof profile === 'undefined') {
      response.status(400).send('One parameter is missing')
    }
    else if (cachedKey) {
      response.send(cachedKey)
    }
    else if (target === 'profile') {
      names.push(profile)
      B.getBatchBotScores(names,data => {
        let object = {
          metadata: {
            count: 1
          },
          profiles: {
            username: data[0].user.screen_name,
            url: 'https://twitter.com/' + data[0].user.screen_name,
            avatar: data[0].user.profile_image_url,
            language_dependent: {
              content: {
                value: data[0].botometer.categories.content
              },
              sentiment: {
                value: data[0].botometer.categories.sentiment
              }
            },
            language_independent: {
              friend: data[0].botometer.categories.friend,
              temporal: data[0].botometer.categories.temporal,
              network: data[0].botometer.categories.network,
              user: data[0].botometer.categories.user
            },
            bot_probability: {
              all: data[0].botometer.scores.universal,
              language_independent: data[0].botometer.scores.english
            },
            share_link_on_social_network: ".",
            user_profile_language: data[0].user.lang,
            feedback_report_link: "."
          }
        };
        response.send(JSON.stringify(object))
        mcache.put(key, JSON.stringify(object), cache_duration * 1000)
        console.log(object);
      });
    }
    else if (target === 'followers' || target === 'friends') {
      requestTwitterList(target, profile, function(object) {
        if (typeof object.metadata.error === 'undefined') {
          mcache.put(key, JSON.stringify(object), cache_duration * 1000)
        }
        response.send(JSON.stringify(object))
        console.log(object);
      })
    }
    else {
      response.status(400).send('search_for is wrong')
    }
});

function requestTwitterList(search_for, profile, callback) {
  let cursor = -1;
  let list = new Array();
  let total = 0;
  let param = {
    screen_name: profile
  };
  client.get('users/show', param, function(error, tweets, response_twitter_user) {
    if (error) {
      console.log(error);
    }
    total = JSON.parse(response_twitter_user.body)[search_for + '_count']
    async.whilst(
      function() { return cursor != 0; },
      function(next) {
        let params = {
          screen_name: profile,
          count: 200,
          cursor: cursor
        };
        client.get(search_for + '/list', params, function(error, tweets, response_twitter) {
          if (error) {
            console.log(error);
            next(error);
          }
          else {
            let data = JSON.parse(response_twitter.body)
            data.users.forEach(function(current) {
              list.push(current)
            })
            cursor = data.next_cursor;
            next();
          }
        })
      },
      function (err) {
        let object = {
          metadata: {
            count: list.length,
            total: total
          },
          profiles: new Array()
        };
        list.forEach(function(value) {
          object.profiles.push({
              username: value.screen_name,
              url: 'https://twitter.com/' + value.screen_name,
              avatar: value.profile_image_url,
              user_profile_language: value.lang
          })
        })
        if (err) {
          object.metadata.error = err
        }
        callback(object)
      }
    )
  })
}
