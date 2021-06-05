import ApplicationError from './applicationError';

export default class Unauthorized extends ApplicationError {
  constructor(message?: string) {
    super(message || 'Unauthorized', 401);
  }
}
