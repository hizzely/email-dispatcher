# Email Dispatcher
A simple Nodejs app built with Express, Nodemailer, and Mustache for sending email in batch to SMTP Server. An app for quick, dirt, and cheap solution when i need to send email in batch with customized content for each recipient. 

## How to use
0. Make sure you have installed Nodejs and NPM on your system
1. Clone or download this repository
2. Run `npm install` inside the project folder to install the required dependencies
3. Run `npm run start` in production, or `npm run dev` to activate auto reload function.
4. Use the app by calling its API endpoints.  

This app expose three HTTP API endpoints that you can use to communicate with the app. 
- GET: `/`
This endpoint return the app state. You can use this to monitor the app status on sending email.
- POST: `/queue/push`
You can send your list of emails and its additional data to the app queue list.  
This endpoint ONLY accept JSON array of object, the property/content is up to you.
- DELETE: `/delete/:email`
Delete an email listed in queue or finished list.

## Warning!
If you use Gmail SMTP server, you might need to use G Suite account to avoid your email being easily flagged as spam. 
Regardless, you shouldn't fully depend on solution like this if you want to create something like a reliable transactional email.
Instead, you should use proper email service solution that are available out there. 

## Limitation
As the name implies, the purpose of this app is only for sending email to your designated SMTP server.
It cannot track or know wether your email is actually delivered or rejected (at least for now).

## License
MIT
