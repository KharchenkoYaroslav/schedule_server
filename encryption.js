import crypto from 'crypto';

export function encrypt(text) {
    const cipher = crypto.createCipher('aes-256-cbc', process.env.SECRET_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

