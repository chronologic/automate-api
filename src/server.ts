import app from './app';
import * as http from 'http';
const PORT = 3000;

// const httpsOptions = {
//     key: fs.readFileSync('./config/key.pem'),
//     cert: fs.readFileSync('./config/cert.pem')
// }

http.createServer(app).listen(PORT, () => {
    console.log('Express server listening on port ' + PORT);
})