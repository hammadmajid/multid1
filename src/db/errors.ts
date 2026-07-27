export class ReferentialIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReferentialIntegrityError'
  }
}
