import { DomainException } from './domain-exception';
import errorMessage from '../constants/messages/error-message';
export class ForbiddenException extends DomainException {
    constructor(message, detail) {
        super(message ?? errorMessage.UNAUTHORIZED_ACCESS, detail);
        Object.setPrototypeOf(this, ForbiddenException.prototype);
    }
}
