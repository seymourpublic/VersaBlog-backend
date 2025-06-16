const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs folder exists
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    // Log in JSON format for centralized logging systems
    winston.format.json()
  ),
  transports: [
    // Log info and higher to the console
    new winston.transports.Console(),
    // Log errors to a dedicated file
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    // Log all messages to a combined log file
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') })
  ]
});

module.exports = logger;
