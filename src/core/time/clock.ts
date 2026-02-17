export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  public constructor(private readonly fixedDate: Date) {}

  public now(): Date {
    return new Date(this.fixedDate.toISOString());
  }
}

export const clock: Clock = new SystemClock();
