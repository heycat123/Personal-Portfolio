import SlotCounter from 'react-slot-counter';

export default function AnimatedCount({
  value,
  className = '',
  direction = 'top-down',
  duration = 0.55,
}) {
  const normalized = Number.isFinite(Number(value)) ? Number(value) : 0;

  return (
    <span className={`inline-flex tabular-nums ${className}`}>
      <SlotCounter
        value={normalized}
        direction={direction}
        duration={duration}
        animateUnchanged={false}
        startValueOnce
        useMonospaceWidth
        dummyCharacterCount={4}
        containerClassName="inline-flex items-baseline leading-none"
        charClassName="inline-block"
        numberSlotClassName="inline-block"
      />
    </span>
  );
}
