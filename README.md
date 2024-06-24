# ai-scout-audio2

Demo of some uses of semantic searching and delivery of audio transcripts.

This repo contains code that has been copied from a succession of exploratory demos, so there is dead code inherited from those demos. When I come across it, I'll delete it.  The predecessor to this code base could only deal with single session interviews.  But it did have a capability to correct transcripts and assign of text to speakers that this version doesnt have yet (but should be straightforward to add).

We ingest lots of transcripts created by Francis using WhisperX.

We convert these into a lighter JSON format, to make manipulation easier and create hierachical summaries.

One of the main things this demo is investigating is approaches to creating summaries and indexing.

The Java programs loaded data into a SOLR index, the web server runs a simple demo search.


## Web server

Typical node server.  Uses https because it makes sooky browsers complain less.  But github frets about even self-signed certs being exposed, so you'll have to recreate them yourself, something like:

```
(base) kfitch@hinton:~/pictures/web$ openssl genrsa -out key.pem
(base) kfitch@hinton:~/pictures/web$ openssl req -new -key key.pem -out csr.pem
You are about to be asked to enter information that will be incorporated
into your certificate request.
What you are about to enter is what is called a Distinguished Name or a DN.
There are quite a few fields but you can leave some blank
For some fields there will be a default value,
If you enter '.', the field will be left blank.
-----
Country Name (2 letter code) [AU]:
State or Province Name (full name) [Some-State]:ACT
Locality Name (eg, city) []:Canberra
Organization Name (eg, company) [Internet Widgits Pty Ltd]:NLA
Organizational Unit Name (eg, section) []:Digital
Common Name (e.g. server FQDN or YOUR name) []:hinton.nla.gov.au
Email Address []:kfitch@nla.gov.au

Please enter the following 'extra' attributes
to be sent with your certificate request
A challenge password []:
An optional company name []:
(base) kfitch@hinton:~/pictures/web$ openssl x509 -req -days 360 -in csr.pem -signkey key.pem -out cert.pem
Certificate request self-signature ok
subject=C = AU, ST = ACT, L = Canberra, O = NLA, OU = Digital, CN = hinton.nla.gov.au, emailAddress = kfitch@nla.gov.au
(base) kfitch@hinton:~/pictures/web$
```

This creates these files:

key.pem csr.pem cert.pem

The .env file defines the TCP port the node server will listen on, and how it can find SOLR and an embedding and a completion (LLM generation) service.  This demo uses nomic embeddings.

The node app was copied from an earlier newspapers demo.  The js packages I think are used are a typical set:

```
npm install express
npm install helmet
npm install body-parser
npm install axios
npm install dotenv
npm install cookie-parser
npm install http-errors
npm install log4js
npm install morgan
npm install rotating-file-stream
npm install ejs
npm install moment
npm install solr-client
```

run webserver like this

`node app.js`


## Loading interviews

This is the most interesting part!  There's the expected stuffing around trying to cope with some variable TEI structure and getting it into JSON (boring).  The interesting part is trying to create a hierarchical summary that is coherent.  To do this, low level transcript chunks are summarised and combined and those summaries themselves combined and summarised.  The "coherent" part means that we try to avoid having to summarise disparate content, so we measure the similarity of adjacent chunks (or summaries) and only reluctantly combine them if they are dissimilar.  (Reluctantly, but pragmatically - for example, if we only had 2 summaries but they were dissimilar, we'd still have to combine them to produce the next higher level summary.)

The intuition behind this is that dissimilar content should probably trigger the start of a new summary, which might be represented in a new paragraph.  This may make more sense to the user, and it might make the summary better too. Is it successful?  I'm not sure - TODO.

The length of summaries and trancript chunks was initially driven by the approx 300 word / 500 token embedding engine limit, but now we're using nomic (over 10 times longer context), maybe that's unnecessary.  Although perhaps 300 words is a useful context size for humans too!

Interview and top-level session summaries are linked, at the sentence level, to lower-level summaries or transcript chunks.  Should they always link to transcript chunks?  I'm not sure.  Should all hierarchical summaries ALSO have downlinks?  I'm not sure - easy to do!

## Chat

There's a general chat interface at /chat
There's an experimental "chat with the transcript" when viewing the transcript.  Sometimes is is fantastic, sometimes disappointing so much more work is needed on prompt and selection/prep of RAG content.  It should also hyperlink from chat response into the transcript.  Perhaps chat should be "everywhere", eg selectable at a session level, or on a time range (although the hierarchical summaries attempt to summarise time ranges).

## Playing audio

I put a bit of thought into this, so audio control gets fixed at bottom right of page when playing and by default syncs transcript with audio and highlights transcript being rendered.  Maybe we should highlight word by word too (we have the information with timestamps!).

## Deep linking from search result to summary/transcript

Is this useful?  Or confusing?  Could a UI designer make this work better?

## SOLR schemas

I'm not sure the best way to represent the hierarchy of interview/session/session-part (where session-parts are both a hierarchical set of summaries of a session and of an interview, and individual chunks of transcript content, typically a few minutes in length).  Perhaps a fancy Lucene parent-child structure?  But instead, here I denormalise most of the content to the session-part schema.

There are 3 in SOLRschemas:

1. audio2Interview-managed-schema.xml - basic interview info including an interview summary.  Not searched.
2. audio2Session-managed-schema.xml - session level info, including a session summary.  Not searched.
3. audio2SessionPart-managed-schema.xml - interview and session summaries with embeddings and keyword searchable, AND hierarchical session summaries also with embeddings and keyword searchable AND low-level transcript chunks, with embeddings and keyword searchable.  The search basically groups results at the interview level and tries to find the most relevant keyword and semantic hits, whether they come from a summary or a transcript chunk.

Because I'm not sure what the best approach is, lots of things are tried, and weightings exposed in the web UI.

The audio2SessionPart fields record the type of content (field partType: overall interview summary, overall session summary, hierarchical session summary, transcript chunk) and the partId field, along with the sessionSeq, allows the full hierarchy to be recreated when needed.
