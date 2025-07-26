// Quick environment check
console.log('Environment Check:');
console.log('NODE_ENV:', process.env.NODE_ENV || 'undefined');
console.log('Current mode:', process.env.NODE_ENV === 'production' ? 'PRODUCTION' : 'DEVELOPMENT');