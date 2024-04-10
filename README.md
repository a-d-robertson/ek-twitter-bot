# ek-twitter-bot

This is just the JavaScript code for the bot - no images, or data files, or any of the Python scripts used to generate the data files.

This ran as a node app and monitored a webhook that alerted it when someone tweeted @ the bot.

It would then:

- parse the message to extract any emoji
- classify the extracted emoji into a particular status:
	- no emoji: do nothing
	- no emoji but includes the word "random": send a random Emoji Kitchen
	- no emoji supported by Emoji Kitchen: send a random heart art
	- one supported emoji AND random request: send that + random second emoji
	- no supported emoji AND random request: send double random
	- one supported emoji found but no request for random: send that + random anyway for coverage
	- more than one valid emoji found: take the first two and send
	- two supported emoji but not compatible together: pick one at random and send as heart art
- construct a tweet using the correct EK image and combine some strings to add for flavour
- upload the payload
- post it as a reply

