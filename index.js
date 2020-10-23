const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const { spawn } = require('child_process');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
const port = 2222;

var relays = {};
var relay_processes = {};

function start_process(id,source,target) {

	console.log('start streamlink');

	relays[id]={source:source,target:target};
	if(! relay_processes[id]) relay_processes[id]={};

	var process_sl = spawn('/usr/local/bin/streamlink',[source,'720p,480p,360p,240p','-O']);
	
	if(! relay_processes[id].ffmpeg)
		start_fm_process(id,target);
	
	relay_processes[id].streamlink = process_sl;

	process_sl.stdout.on('data', (data) => {
		try {
			if(relay_processes[id].ffmpeg && relay_processes[id].ffmpeg.stdin.writable)
				relay_processes[id].ffmpeg.stdin.write(data);
		} catch (err) {
			console.log('pipe error: '+err);
		}
	});
	process_sl.on('close', (code) => {
		if (code !== 0) {
			console.log(`streamlink process exited with code ${code}`);
		}else{
			console.log(`streamlink process exited clean`);
		}
		try {
			relay_processes[id].ffmpeg.stdin.end();
		} catch (err) {
			console.log('pipe end error: '+err);
		}
		if(relays[id]) {
			console.log('restart streamlink');
			start_process(id,source,target);
		}
	});
	process_sl.stderr.on('data', (data) => {
		console.log(`sl stderr: ${data}`);
	});
	process_sl.on('error', (err) => {
		console.log('streamlink errored. '+err);
	});
}

function start_fm_process(id,target) {
	
	console.log('start ffmpeg');

	var process_fm = spawn('ffmpeg',['-hide_banner','-re','-i','pipe:0','-c:v','libx264','-c:a','aac','-maxrate','2800k','-bufsize','3000k','-b:a','128k','-bf','2','-s','1280x720','-preset','veryfast','-crf','23','-x264-params','keyint=60:no-scenecut=1','-strict','-2','-f','flv',target]);
	relay_processes[id].ffmpeg = process_fm;

	process_fm.stdin.on('error', () => {
		console.log(`ffmpeg pipe error`);
	});

	process_fm.on('close', (code) => {
		relay_processes[id].ffmpeg = null;
		if (code !== 0) {
			console.log(`ffmpeg process exited with code ${code}`);
		}else{
			console.log(`ffmpeg process exited clean`);
		}
		if(relays[id]) {
			console.log('restart ffmpeg');
			start_fm_process(id,target);
		}
	});
	process_fm.stderr.on('data', (data) => {
		//console.error(`fm stderr: ${data}`);
		if(relays[id]) relays[id].ffmpeg=data.toString();
	});
	process_fm.stdout.on('data', (data) => {
		console.log(`fm stdout: ${data}`);
	});
	process_fm.on('error', (err) => {
		relay_processes[id].ffmpeg = null;
		console.log('ffmpeg errored. '+err);
	});
}

app.get('/relay_state', (req, res) => {
	res.send(JSON.stringify(relays));
});

app.post('/add_relay', (req, res) => {
	
	var id = Math.random().toString(36).substr(2, 9);

	start_process(id,req.body.source,req.body.target);

	res.send('ok');
});

app.post('/delete_relay', (req, res) => {
	delete(relays[req.body.id]);
	relay_processes[req.body.id].streamlink.kill('SIGKILL');
	res.send('ok');
});

app.get('/', (req, res) => {
	res.sendFile(__dirname+'/index.html');
});

app.listen(port, () => {
	console.log(`App listening at http://localhost:${port}`)
});

