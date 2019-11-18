# Email Dispatcher
A simple Nodejs app built with Express, Nodemailer, and Mustache for sending email in batch to SMTP Server. An app for quick, dirt, and cheap solution when i need to send email in batch with customized content for each recipient. 

## Warning!
If you use Gmail SMTP server, you might need to use G Suite account to avoid your email being easily flagged as spam. 
Regardless, you shouldn't fully depend on solution like this if you want to create something like a reliable transactional email.
Instead, you should use proper email service solution that are available out there. 

## Limitation
As the name implies, the purpose of this app is only for sending email to your designated SMTP server.
It cannot track or know wether your email is actually delivered or rejected (at least for now).

## License
MIT