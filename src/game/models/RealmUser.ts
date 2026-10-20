// Ported from osu.Game/Models/RealmUser.cs

export class RealmUser {
  onlineID = 1;

  username = '';

  countryString = 'Unknown';

  get isBot(): boolean {
    return false;
  }

  equals(other: RealmUser | null): boolean {
    if (other === null) return false;

    return this.onlineID === other.onlineID && this.username === other.username;
  }

  deepClone(): RealmUser {
    const u = new RealmUser();
    u.onlineID = this.onlineID;
    u.username = this.username;
    u.countryString = this.countryString;
    return u;
  }
}
