import crypto from 'crypto';

export function decrypt(encryptedText) {
    const decipher = crypto.createDecipher('aes-256-cbc', process.env.SECRET_KEY);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}