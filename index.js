import app from './app.js';

const port = process.env.PORT || 7789;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});