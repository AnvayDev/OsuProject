// Ported from osu.Framework/Logging/Logger.cs (Log and Error only; entries go to the browser console instead of log files).

export enum LogLevel {
  /** Log-level for debugging-related log-messages. This is the lowest level (highest verbosity). Please note that this will log input events, including keypresses when entering a password. */
  Debug,

  /** Log-level for most log-messages. This is the second-lowest level (second-highest verbosity). */
  Verbose,

  /** Log-level for important log-messages. This is the second-highest level (second-lowest verbosity). */
  Important,

  /** Log-level for error messages. This is the highest level (lowest verbosity). */
  Error,
}

export enum LoggingTarget {
  /** Logging target for general information. Everything logged with this target will not be written to a logfile. */
  Information,

  /** Logging target for information about the runtime. */
  Runtime,

  /** Logging target for network-related events. */
  Network,

  /** Logging target for performance-related information. */
  Performance,

  /** Logging target for database-related events. */
  Database,

  /** Logging target for input-related events. */
  Input,
}

export const Logger = {
  /** Log an arbitrary string to the specified logging target. */
  log(message: string, target = LoggingTarget.Runtime, level = LogLevel.Verbose): void {
    const line = `[${LoggingTarget[target].toLowerCase()}] ${message}`;

    switch (level) {
      case LogLevel.Error:
        console.error(line);
        break;

      case LogLevel.Important:
        console.info(line);
        break;

      default:
        console.debug(line);
        break;
    }
  },

  /** Log an error and its exception (Logger.Error(Exception, string, LoggingTarget)). */
  error(e: unknown, description: string, target = LoggingTarget.Runtime): void {
    console.error(`[${LoggingTarget[target].toLowerCase()}] ${description}`, e);
  },
};
