// Stuff for interacting with Twitter

const {Autohook} = require('twitter-autohook');
const qs = require('querystring');
const request = require('request');

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

const util = require('util');
const path = require('path');
const os = require('os');
const fs = require('fs');
const URL = require('url').URL;

const get = util.promisify(request.get);
const post = util.promisify(request.post);
const sleep = util.promisify(setTimeout);

const requestTokenURL = new URL('https://api.twitter.com/oauth/request_token');
const accessTokenURL = new URL('https://api.twitter.com/oauth/access_token');
const authorizeURL = new URL('https://api.twitter.com/oauth/authorize');

var Twitter = require('twitter');

var twitter_client = new Twitter({
  access_token_key: process.env.TWITTER_ACCESS_TOKEN,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
});

async function input(prompt) {
  return new Promise(async (resolve, reject) => {
    readline.question(prompt, (out) => {
      readline.close();
      resolve(out);
    });
  });
}

async function accessToken({oauth_token, oauth_token_secret}, verifier) {
  const oAuthConfig = {
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    token: oauth_token,
    token_secret: oauth_token_secret,
    verifier: verifier,
  }; 
  
  const req = await post({url: accessTokenURL, oauth: oAuthConfig});
  if (req.body) {
    return qs.parse(req.body);
  } else {
    throw new Error('Cannot get an OAuth access token');
  }
}

async function requestToken() {
  const oAuthConfig = {
    callback: 'oob',
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  };

  const req = await post({url: requestTokenURL, oauth: oAuthConfig});
  if (req.body) {
    return qs.parse(req.body);
  } else {
    throw new Error('Cannot get an OAuth request token');
  }
}

// My stuff

// Regex for parsing emoji from strings
const emojiRegex = require('emoji-regex');
const regex = emojiRegex();

// Map emoji to text names for easier file indexing/locating
const emoji_name_data = JSON.parse(fs.readFileSync('data/emoji_to_name.json', 'utf8'));

// Map text names to emoji for easier file indexing/locating
const name_emoji_data = JSON.parse(fs.readFileSync('data/name_to_emoji.json', 'utf8'));

// Various phrases for including in bot responses
const phrase_data = JSON.parse(fs.readFileSync('data/phrase_data.json', 'utf8'));

// The actual filenames of the assets using text names instead of codepoints
const ek_filenames = JSON.parse(fs.readFileSync('data/filenames.json', 'utf8'));

// Full list of valid combos
const valid_combos = JSON.parse(fs.readFileSync('data/valid_combos.json', 'utf8'));

// The emoji which are found in at least one combination
// Also includes alts
const supported_emoji = new Set(JSON.parse(fs.readFileSync('data/supported_emoji.json', 'utf8'))['supported_emoji']);
const supported_alts = new Set(JSON.parse(fs.readFileSync('data/supported_alts.json', 'utf8'))['supported_emoji']);

// The emoji which map to a base version
const has_double = new Set(JSON.parse(fs.readFileSync('data/has_double.json', 'utf8'))['has_double']);

// Map the alts to their base version, by name
const alt_to_base = new Map(Object.entries(JSON.parse(fs.readFileSync('data/alt_to_base.json', 'utf8'))));

// The success strings
const success_strings = JSON.parse(fs.readFileSync('data/success_strings.json', 'utf8'));


// My functions that do stuff


function map_alts(name) {
  var m = alt_to_base.get(name);

  if (m) {
    return m;
  } else {
    return name;
  };

};


function extract_valid_emoji_as_names(message) {
  // Get all emoji from a tweet
  // Convert them to names
  //    - but also take care of "alternatives": 🐖 and 🐽 should match to 🐷 etc
  // Filter to include only the supported ones
  // Return status and names and the actual emoji
  var emoji_found = message.match(regex);

  if (!emoji_found & message.toLowerCase().includes('random')) {
    // No emoji but the word random, so send a random valid combo
    return ['random', [], []];
  };

  if (!emoji_found) {
    // No emoji and no instructions for random - ignore
    return ['no_emoji', [], []];
  };

  // Convert emoji to names for checking valid status and building filepaths
  var names_found = [];
  for (i in emoji_found) {
    names_found.push(emoji_name_data[emoji_found[i]]);
  };

  // Convert alts to base emoji name to increase coverage
  names_found = names_found.map(n => map_alts(n));

  var valid_found = names_found.filter(x => supported_emoji.has(x)).sort().map(n => map_alts(n));


  if (valid_found.length === 0) {
    // Emoji in message are not supported at all in EK
    return ['0_valid', [], emoji_found];
  };
      

  if (valid_found.length === 1 & message.toLowerCase().includes('random')) {
    if (supported_emoji.has(valid_found[0])) {
      // One supported emoji AND random request, so do that + random
      return ['1_valid_random_request', valid_found, emoji_found]
    } else {
      // No supported emoji AND random request, so do double random
      return ['1_invalid_random_request', [], emoji_found] }
  };  


  if (valid_found.length === 1 & supported_emoji.has(valid_found[0])) {
    // One supported emoji found but no request for random, but do that anyway for coverage
    return ['1_valid_random', valid_found, emoji_found];
  }; 

  if (valid_found.length > 1) {
    // More than one valid emoji found. Take the first two...
    var file_location = `./renamed_assets/${valid_found[0]}/${valid_found[1]}.png`;

    if (fs.existsSync(file_location)) {
      if (valid_found[0] === valid_found[1]) {
        // Double up if they are the same - full success
        return ['double_up', valid_found, emoji_found];
      } else {
        // If different, that's full success too
        return ['2_valid', valid_found, emoji_found]; 
      };
      
    } else {
      // If no file then not a valid combo - pick one and add random for coverage
      return ['2_incompat', valid_found, emoji_found];
    };
  };
};



function pick_random_from_input(options) {
  return options[Math.floor(Math.random()*options.length)];
};


function pick_random(source) {
  return source[Math.floor(Math.random()*source.length)];
};


function pick_random_phrase(phrase_data, phrase_type, sender_name) {
  var p = phrase_data[phrase_type][Math.floor(Math.random()*phrase_data[phrase_type].length)];
  return `@${sender_name} ${p}`;
};


function sort_names(e1, e2) {
  return [e1, e2].sort();
};


function get_success_string(success_strings, e1, e2) {
    var strings = success_strings[e1][e2];
    
    if (strings == null){
        var strings = success_strings[e2][e1];
    };
    
    p = pick_random(strings);
    
    return p;
};


async function reply_to_mention(event, oauth) {
  if (typeof event.tweet_create_events === 'undefined') {
    // console.log('Not what I am looking for...');
    // pass
    return;
  };
  
  // Get the tweet data
  const tweet = event.tweet_create_events.shift();
  const sender_name = tweet.user.screen_name;

  // Print it all out so I can SEE
  // console.log(event);
  if (sender_name === 'a_d_robertson') {
    fs.writeFile('./adr_log.txt', `===event===\n${JSON.stringify(event)}\n`, { flag: 'a+' }, err => {});
    fs.writeFile('./adr_log.txt', `===tweet===\n${JSON.stringify(tweet)}\n`, { flag: 'a+' }, err => {});
  };

  // Filter out retweets that refer to the bot
  if (typeof tweet.retweeted_status != 'undefined'){
    return;
  };

  // Filter out messages created by the bot (to avoid sending messages to oneself)
  if (sender_name === 'emojikitchen') {
    return;
  };

  // Get the tweet text

  if (typeof tweet.extended_tweet === 'undefined') {
    var message = tweet.text;
  } else {
    var message = tweet.extended_tweet.full_text;
  };

  const [status, valid_found, emoji_found] = extract_valid_emoji_as_names(message);

  console.log(status, valid_found, emoji_found, message)

  // console.log(message);

  switch (status) {
    case "no_emoji":

    var message_to_user = null;
    var file_location = null;

    break;

    case "random":

    var emoji1 = [...supported_emoji][Math.floor(Math.random()*supported_emoji.size)];
    var emoji2 = pick_random(ek_filenames[emoji1]);

    var [emoji1, emoji2] = sort_names(emoji1, emoji2);

    var message_text = get_success_string(success_strings, emoji1, emoji2)
    var message_to_user = `@${sender_name} ${message_text} ${name_emoji_data[emoji1]} ${name_emoji_data[emoji2]}`

    

    var file_location = `./renamed_assets/${emoji1}/${emoji2}.png`;

    break;

    case "0_valid":

    var template = 'XXXXXXXXX\nXX__X__XX\nX_______X\nX_______X\nXX_____XX\nXXX___XXX\nXXXX_XXXX\nXXXXXXXXX';
    var file_location = null;

    if (emoji_found.length === 1 || emoji_found[0] == emoji_found[1]) {
      var message_to_user = `@${sender_name} ${template.replaceAll('_', emoji_found[0]).replaceAll('X', '❤️')}`;
    } else {
      var message_to_user = `@${sender_name} ${template.replaceAll('_', emoji_found[0]).replaceAll('X', emoji_found[1])}`;
    };

    break;

    case "1_valid_random":

    var emoji1 = valid_found[0];
    var random_emoji = pick_random(valid_combos[emoji1]);

    var improv_text = `(Had to improvise and threw in a little ${name_emoji_data[random_emoji]})`

    var [emoji1, random_emoji] = sort_names(emoji1, random_emoji);

    var message_text = get_success_string(success_strings, emoji1, random_emoji)
    var message_to_user = `@${sender_name} ${message_text} ${name_emoji_data[emoji1]} ${name_emoji_data[random_emoji]}\n${improv_text}`

    var file_location = `./renamed_assets/${emoji1}/${random_emoji}.png`;

    break;

    case "1_valid_random_request":
    // use success_strings

    var emoji1 = valid_found[0];
    var random_emoji = pick_random(valid_combos[emoji1]);

    var [emoji1, random_emoji] = sort_names(emoji1, random_emoji);

    var message_text = get_success_string(success_strings, emoji1, random_emoji)
    var message_to_user = `@${sender_name} ${message_text} ${name_emoji_data[emoji1]} ${name_emoji_data[random_emoji]}`

    var file_location = `./renamed_assets/${emoji1}/${random_emoji}.png`;

    break;

    case "1_invalid_random_request":
    // give error
    // use success_strings

    var emoji1 = valid_found[0];
    var random_emoji = pick_random(valid_combos[emoji1]);

    var [emoji1, random_emoji] = sort_names(emoji1, random_emoji);

    var message_text = get_success_string(success_strings, emoji1, random_emoji)
    var message_to_user = `@${sender_name} ${message_text}`

    var file_location = `./renamed_assets/${emoji1}/${random_emoji}.png`;

    break;

    case "2_incompat":

    var [emoji1, emoji2] = valid_found;
    var random_from_input = pick_random_from_input(valid_found);
    var random_second_emoji = pick_random(valid_combos[random_from_input]);

    var improv_text = `(Had to improvise and threw in a little ${name_emoji_data[random_second_emoji]})`

    var [random_from_input, random_second_emoji] = sort_names(random_from_input, random_second_emoji);

    var message_text = get_success_string(success_strings, random_from_input, random_second_emoji)
    var message_to_user = `@${sender_name} ${message_text} ${name_emoji_data[random_from_input]} ${name_emoji_data[random_second_emoji]}\n${improv_text}`

    var file_location = `./renamed_assets/${random_from_input}/${random_second_emoji}.png`;

    break;


    case "2_valid":

    var [emoji1, emoji2] = valid_found;
    var message_text = get_success_string(success_strings, emoji1, emoji2)
    var message_to_user = `@${sender_name} ${message_text} ${name_emoji_data[emoji1]} ${name_emoji_data[emoji2]}`
    var file_location = `./renamed_assets/${emoji1}/${emoji2}.png`;

    break;

    case "double_up":

    var [emoji1, emoji2] = valid_found;

    var message_text = get_success_string(success_strings, emoji1, emoji2)
    var message_to_user = `@${sender_name} ${message_text} ${name_emoji_data[emoji1]} ${name_emoji_data[emoji2]}`

    var file_location = `./renamed_assets/${emoji1}/${emoji2}.png`;

    break;
  };



  var now = new Date();

  var stream = fs.createWriteStream(`logs/${now.toDateString()}.txt`, {flags:'a'});
  stream.write(now.toUTCString() + '\t' + status + '\t' + sender_name + '\t' + message.replaceAll('\n', ' ') + '\t' + emoji_found + '\t' + valid_found + '\t' + file_location + '\n');
  stream.end();
  
  console.log(now.toUTCString(), '\n', status, '\n', sender_name, '\n', message.replaceAll('\n', ' '), '\n', emoji_found, '\n', valid_found, '\n', file_location, '\n', '==================');

  // Check for not sending

  if (message_to_user === null) {
    return;
  };


  // Get auth ready

  const oAuthConfig = {
    token: oauth.oauth_token,
    token_secret: oauth.oauth_token_secret,
    consumer_key: oauth.consumer_key,
    consumer_secret: oauth.consumer_secret,
  };

  const thread_to_reply_to = tweet.id_str;

  if (file_location) {
      // Upload and send the image

    var image_data = fs.readFileSync(file_location);

    twitter_client.post('media/upload', {media: image_data}, function(error, media, response) {
        if (!error) {

          // If successful, a media object will be returned.
          // Lets tweet it
          var status = {status: message_to_user,
                        media_ids: media.media_id_string, // Pass the media id string
                        in_reply_to_status_id: thread_to_reply_to,
                       };

          twitter_client.post('statuses/update', status, function(error, tweet, response) {
            if (!error) {
              console.log(error);
            };
          });
        };
      });
    } else {
      // No image but we can send a message...
        var status_noimg = {status: message_to_user,
                            in_reply_to_status_id: thread_to_reply_to,
                     };

        twitter_client.post('statuses/update', status_noimg, function(error, tweet, response) {
          if (!error) {
            console.log(error);
          };
        });
    };
  };


(async () => {
  try {

    // Get request token
    const oAuthRequestToken = await requestToken();
    
    // Get authorization
    authorizeURL.searchParams.append('oauth_token', oAuthRequestToken.oauth_token);
    console.log('Please go here and authorize:', authorizeURL.href);
    const pin = await input('Paste the PIN here: ');
    
    // Get the access token
    const userToMonitor = await accessToken(oAuthRequestToken, pin.trim());
    const webhook = new Autohook({
      token: process.env.TWITTER_ACCESS_TOKEN,
      token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
      consumer_key: process.env.TWITTER_CONSUMER_KEY,
      consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
      env: process.env.TWITTER_WEBHOOK_ENV});

    // Look for events

    webhook.on('event', async (event) => {
      // console.log('Something happened!');
      // console.log(event);

      await reply_to_mention(event, {
        oauth_token: userToMonitor.oauth_token,
        oauth_token_secret: userToMonitor.oauth_token_secret,
        user_id: userToMonitor.user_id,
        consumer_key: process.env.TWITTER_CONSUMER_KEY,
        consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
        reset: true,
      });
    });



    await webhook.removeWebhooks();
    await webhook.start();
    await webhook.subscribe(userToMonitor);
    
  } catch(e) {
    console.error(e);
    // process.exit(-1);
  }
})();