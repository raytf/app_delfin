export class DomainException extends Error {
    detail;
    constructor(message, detail) {
        super(message);
        this.detail = detail;
        this.name = 'DomainException';
        Object.setPrototypeOf(this, DomainException.prototype);
    }
}
