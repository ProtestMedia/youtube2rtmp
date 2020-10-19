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

	relays[id]={source:source,target:target};

	var process_sl = spawn('/usr/local/bin/streamlink',[source,'best','-O']);
	var process_fm = spawn('ffmpeg',['-hide_banner','-re','-i','pipe:0','-c:v','copy','-c:a','copy','-bsf:a','aac_adtstoasc','-strict','-2','-f','flv',target]);
	
	relay_processes[id]={streamlink:process_sl,ffmpeg:process_fm};
	
	process_sl.stdout.on('data', (data) => {
		process_fm.stdin.write(data);
	});
	process_sl.on('close', (code) => {
		if (code !== 0) {
			console.log(`streamlink process exited with code ${code}`);
		}
		process_fm.stdin.end();
	});
	process_sl.stderr.on('data', (data) => {
		console.error(`sl stderr: ${data}`);
	});
	process_fm.stderr.on('data', (data) => {
		console.error(`fm stderr: ${data}`);
		if(relays[id]) relays[id].ffmpeg=data.toString();
	});
	process_fm.stdout.on('data', (data) => {
		console.error(`fm stdout: ${data}`);
	});
	process_sl.on('error', (err) => {
		console.error('streamlink errored.');
	});
	process_fm.on('error', (err) => {
		console.error('ffmpeg errored.');
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

