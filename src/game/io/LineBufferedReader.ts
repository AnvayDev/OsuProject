// Ported from osu.Game/IO/LineBufferedReader.cs. Wraps the decoded text instead of a Stream; the bytes are decoded the way
// `new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true)` does (UTF-8 unless a UTF-16 byte order mark is present).

/** A StreamReader-like decorator (with more limited API) for streams that allows lines to be peeked without consuming. */
export class LineBufferedReader {
  private readonly text: string;
  private position = 0;

  private peekedLine: string | null = null;

  constructor(data: Uint8Array | string) {
    this.text = typeof data === 'string' ? data : decode(data);
  }

  /** Reads the next line from the stream without consuming it. Subsequent calls to peekLine without a readLine will return the same string. */
  peekLine(): string | null {
    return this.peekedLine ??= this.readStreamLine();
  }

  /** Reads the next line from the stream and consumes it. If a line was peeked, that same line will then be consumed and returned. */
  readLine(): string | null {
    const line = this.peekedLine ?? this.readStreamLine();

    this.peekedLine = null;
    return line;
  }

  /** Reads the stream to its end and returns the text read. This includes any peeked but unconsumed lines. */
  readToEnd(): string {
    const remainingText = this.text.slice(this.position);
    this.position = this.text.length;

    if (this.peekedLine === null)
      return remainingText;

    // this might not be completely correct due to varying platform line endings
    return `${this.peekedLine}\n${remainingText}`;
  }

  /** StreamReader.ReadLine: a line ends at "\n", "\r" or "\r\n"; null once the end of the text has been reached. */
  private readStreamLine(): string | null {
    const text = this.text;

    if (this.position >= text.length)
      return null;

    const start = this.position;
    let end = start;

    while (end < text.length && text[end] !== '\n' && text[end] !== '\r')
      end++;

    this.position = end + (text[end] === '\r' && text[end + 1] === '\n' ? 2 : 1);

    return text.slice(start, end);
  }
}

function decode(bytes: Uint8Array): string {
  if (bytes[0] === 0xFE && bytes[1] === 0xFF)
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));

  if (bytes[0] === 0xFF && bytes[1] === 0xFE)
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));

  // TextDecoder strips a UTF-8 byte order mark.
  return new TextDecoder('utf-8').decode(bytes);
}
