-- Mirrors packages/kernel TRANSITIONS (a test checks parity): raw SQL can no longer skip the state machine.
CREATE TRIGGER work_state_transition BEFORE UPDATE OF state ON work_items
WHEN NEW.state <> OLD.state AND NOT (
  (OLD.state='backlog' AND NEW.state IN ('ready','cancelled')) OR
  (OLD.state='ready' AND NEW.state IN ('backlog','assigned','blocked','cancelled')) OR
  (OLD.state='assigned' AND NEW.state IN ('running','cancel_requested','blocked','indeterminate','cancelled')) OR
  (OLD.state='running' AND NEW.state IN ('reviewing','failed','blocked','cancel_requested','indeterminate')) OR
  (OLD.state='reviewing' AND NEW.state IN ('changes_requested','verified','cancel_requested')) OR
  (OLD.state='changes_requested' AND NEW.state IN ('ready','cancelled')) OR
  (OLD.state='verified' AND NEW.state IN ('completed','changes_requested','cancelled')) OR
  (OLD.state='blocked' AND NEW.state IN ('ready','cancelled')) OR
  (OLD.state='cancel_requested' AND NEW.state IN ('cancelled','indeterminate')) OR
  (OLD.state='failed' AND NEW.state IN ('ready','cancelled')) OR
  (OLD.state='indeterminate' AND NEW.state IN ('blocked','cancelled'))
)
BEGIN
  SELECT RAISE(ABORT,'INVALID_TRANSITION');
END;
