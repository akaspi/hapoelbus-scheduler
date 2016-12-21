const express = require('express');
const app = express();
const server = require('http').createServer(app);
const port = process.env.PORT || 8080;

app.get('/', (req, res) => {
    res.send('Hello World!');
});


server.listen(port, () => {
  console.log(`Production server listening at port ${port}`);
});