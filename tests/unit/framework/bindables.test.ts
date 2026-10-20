// Ported from osu.Framework.Tests/Bindables/BindableBindingTest.cs, BindableLeasingTest.cs, BindableDoubleTest.cs, BindableIntTest.cs (subset).
import { beforeEach, describe, expect, it } from 'vitest';
import { Bindable, BindableBool } from '@fw/bindables/Bindable';
import { BindableDouble, BindableFloat, BindableInt } from '@fw/bindables/BindableNumber';
import { Box } from '@fw/graphics/shapes/Box';
import { Vector2 } from '@fw/layout/Vector2';

describe('BindableBindingTest', () => {
  it('TestBindToAlreadyBound', () => {
    const b1 = new Bindable('default');
    const b2 = b1.getBoundCopy();
    expect(() => b1.bindTo(b2)).toThrow();
  });

  it('TestPropagation', () => {
    const b1 = new Bindable('default');
    const b2 = b1.getBoundCopy();
    const b3 = b2.getBoundCopy();
    expect(b2.value).toBe('default');
    b1.value = 'new value';
    expect(b2.value).toBe('new value');
    expect(b3.value).toBe('new value');
  });

  it('TestDisabled', () => {
    const b1 = new Bindable('default');
    const b2 = b1.getBoundCopy();
    const b3 = b2.getBoundCopy();
    b1.disabled = true;
    expect(() => (b1.value = 'new value')).toThrow();
    expect(() => (b2.value = 'new value')).toThrow();
    expect(() => (b3.value = 'new value')).toThrow();
    b1.disabled = false;
    b2.value = 'new value 2';
    expect(b1.value).toBe('new value 2');
    expect(b3.value).toBe('new value 2');
  });

  it('TestDefaultChanged', () => {
    const b1 = new Bindable('default');
    const b2 = b1.getBoundCopy();
    const b3 = b2.getBoundCopy();
    const c = [0, 0, 0];
    b1.defaultChanged.add(() => c[0]++);
    b2.defaultChanged.add(() => c[1]++);
    b3.defaultChanged.add(() => c[2]++);
    b1.default = 'new value';
    b1.default = 'new value 2';
    b1.default = 'new value 2';
    expect(c).toEqual([2, 2, 2]);
  });

  it('TestValueChangedWithUpstreamRejection', () => {
    const b1 = new Bindable("won't change");
    const b2 = b1.getBoundCopy();
    let changed1 = 0, changed2 = 0;
    b1.valueChanged.add(() => changed1++);
    b2.valueChanged.add(() => {
      b2.value = "won't change";
      changed2++;
    });
    b1.value = 'new value';
    expect(b1.value).toBe("won't change");
    expect(b2.value).toBe(b1.value);
    // bindable1 should only receive the final value changed, skipping the intermediary (overidden) one.
    expect(changed1).toBe(1);
    expect(changed2).toBe(2);
  });

  it('TestDisabledChangedWithUpstreamRejection', () => {
    const b1 = new Bindable("won't change");
    const b2 = b1.getBoundCopy();
    let changed1 = 0, changed2 = 0;
    b1.disabledChanged.add(() => changed1++);
    b2.disabledChanged.add(() => {
      b2.disabled = false;
      changed2++;
    });
    b1.disabled = true;
    expect(b1.disabled).toBe(false);
    expect(b2.disabled).toBe(false);
    expect(changed1).toBe(1);
    expect(changed2).toBe(2);
  });

  it('TestMinValueChangedWithUpstreamRejection', () => {
    const b1 = new BindableInt(1337);
    const b2 = new BindableInt();
    b2.bindTo(b1);
    let changed1 = 0, changed2 = 0;
    b1.minValueChanged.add(() => changed1++);
    b2.minValueChanged.add(() => {
      b2.minValue = 1337;
      changed2++;
    });
    b1.minValue = 2;
    expect(b1.minValue).toBe(1337);
    expect(b2.minValue).toBe(b1.minValue);
    expect(changed1).toBe(1);
    expect(changed2).toBe(2);
  });

  it('TestUnbindOnDrawableDispose', () => {
    class TestDrawable extends Box {
      valueChangedFired = false;
      private readonly bindable = new Bindable<number>(0);

      constructor() {
        super();
        this.bindable.bindValueChanged(() => (this.valueChangedFired = true));
      }

      setValue(v: number) {
        this.bindable.value = v;
      }
    }

    const d = new TestDrawable();
    d.setValue(1);
    expect(d.valueChangedFired).toBe(true);
    d.dispose();
    d.valueChangedFired = false;
    d.setValue(2);
    expect(d.valueChangedFired).toBe(false);
  });

  it('TestUnbindFrom', () => {
    const b1 = new Bindable(5);
    const b2 = new Bindable<number>();
    b2.bindTo(b1);
    expect(b2.value).toBe(5);
    b2.unbindFrom(b1);
    b1.value = 10;
    expect(b2.value).not.toBe(b1.value);
  });

  it('value types compare structurally (EqualityComparer)', () => {
    const b = new Bindable(new Vector2(1, 2));
    let fired = 0;
    b.valueChanged.add(() => fired++);
    b.value = new Vector2(1, 2);
    expect(fired).toBe(0);
    b.value = new Vector2(2, 2);
    expect(fired).toBe(1);
  });

  it('bindValueChanged runOnceImmediately', () => {
    const b = new BindableBool(true);
    let got: boolean | null = null;
    b.bindValueChanged(e => (got = e.newValue), true);
    expect(got).toBe(true);
    b.toggle();
    expect(got).toBe(false);
  });
});

describe('BindableLeasingTest', () => {
  let original: Bindable<number>;
  beforeEach(() => {
    original = new Bindable(1);
  });

  for (const revert of [false, true]) {
    it(`TestLeaseAndReturn(${revert})`, () => {
      const leased = original.beginLease(revert);
      expect(leased.value).toBe(original.value);
      leased.value = 2;
      expect(original.value).toBe(2);
      expect(leased.return()).toBe(true);
      expect(original.value).toBe(revert ? 1 : 2);
    });

    it(`TestLeaseReturnedOnUnbindAll(${revert})`, () => {
      const leased = original.beginLease(revert);
      leased.value = 2;
      original.unbindAll();
      expect(original.value).toBe(revert ? 1 : 2);
    });

    it(`TestDisabledRevertedAfterLease(${revert})`, () => {
      let changedState: boolean | null = null;
      original.disabled = true;
      original.disabledChanged.add(d => (changedState = d));
      const leased = original.beginLease(revert);
      expect(leased.return()).toBe(true);
      expect(original.disabled).toBe(true);
      expect(changedState).toBeNull();
    });
  }

  it('TestModifyAfterReturnFail / double return / double lease', () => {
    const leased = original.beginLease(false);
    expect(leased.return()).toBe(true);
    expect(() => (leased.value = 2)).toThrow();
    expect(leased.return()).toBe(false);
    original.beginLease(false);
    expect(() => original.beginLease(false)).toThrow();
  });

  it('TestDisabledStateDuringLease', () => {
    const leased = original.beginLease(true);
    expect(original.disabled).toBe(true);
    expect(leased.disabled).toBe(true);
    expect(() => (original.disabled = false)).toThrow();
    leased.disabled = false;
    expect(original.disabled).toBe(false);
    original.value = 2;
    expect(() => (original.disabled = true)).toThrow();
    leased.disabled = true;
    expect(original.disabled).toBe(true);
    expect(leased.return()).toBe(true);
    expect(original.disabled).toBe(false);
  });

  it('TestDisabledChangeViaBindingToLeased', () => {
    let changedState: boolean | null = null;
    original.disabledChanged.add(d => (changedState = d));
    const leased = original.beginLease(true);
    const bound = leased.getBoundCopy();
    bound.disabled = false;
    expect(changedState).toBe(false);
    expect(original.disabled).toBe(false);
  });

  it('TestValueChangeViaBindings', () => {
    original.beginLease(true);
    const bound = original.getBoundCopy();
    expect(() => (bound.value = 2)).toThrow();
    expect(original.value).toBe(1);
  });
});

describe('BindableNumber', () => {
  const defaultCases: [number, number, number?][] = [
    [-1.0, 1.0], [1.1, 1.0], [-1.1, 1.0],
    [1.00000001, 1.0, 0.00000001], [0.99999999, 1.0, 0.00000001],
    [199.1223345568, 199.1223345567, 0.0000000001], [-199.1223345567, 199.1223345567, 0.0000000001],
  ];
  for (const [value, def, precision] of defaultCases) {
    it(`TestDefaultCheck(${value}, ${def}, ${precision})`, () => {
      const b = new BindableDouble().with({ value: def, default: def });
      if (precision !== undefined) b.precision = precision;
      expect(b.isDefault).toBe(true);
      b.value = value;
      expect(b.isDefault).toBe(false);
    });
  }

  it('TestParsingStringWithRange', () => {
    for (const [str, expected] of [['0', 0], ['1', 1], ['-105.123', -10], ['105.123', 10]] as const) {
      const b = new BindableDouble().with({ minValue: -10, maxValue: 10 });
      b.parse(str);
      expect(b.value).toBe(expected);
    }
  });

  it('precision rounds to decimal values (banker\'s rounding like decimal Math.Round)', () => {
    const b = new BindableDouble().with({ precision: 0.1 });
    b.value = 0.25;
    expect(b.value).toBe(0.2);
    b.value = 0.35;
    expect(b.value).toBe(0.4);
    b.value = 1.23456;
    expect(b.value).toBe(1.2);

    const f = new BindableFloat(1).with({ minValue: 0.8, maxValue: 1.6, precision: 0.01 });
    f.value = 1.234;
    expect(f.value).toBe(1.23);
    f.value = 5;
    expect(f.value).toBe(1.6);
  });

  it('ints truncate and clamp', () => {
    const b = new BindableInt(5).with({ minValue: 0, maxValue: 10 });
    b.value = 12;
    expect(b.value).toBe(10);
    b.set(3.9);
    expect(b.value).toBe(3);
    expect(b.normalizedValue).toBeCloseTo(0.3);
  });
});
