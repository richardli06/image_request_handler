import dotenv from 'dotenv';

// Load environment variables FIRST, before other imports
dotenv.config();

console.log('App.js - Environment check:');
console.log('WEBODM_USERNAME:', process.env.WEBODM_USERNAME);
console.log('WEBODM_PASSWORD:', process.env.WEBODM_PASSWORD ? '***LOADED***' : 'NOT LOADED');

import createError from 'http-errors';
import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';

import indexRouter from './routes/index.js';
import usersRouter from './routes/users.js';
import apiRouter from './routes/api.js';

const app = express();

// view engine setup
app.set('views', path.join(process.cwd(), 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ 
  extended: false, 
  limit: '500mb',
  parameterLimit: 100000  // Increased parameter limit
}));
app.use(cookieParser());
app.use(express.static(path.join(process.cwd(), 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/api', apiRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

export default app;

