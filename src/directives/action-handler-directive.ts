/* istanbul ignore file */
import { noChange } from 'lit';
import { AttributePart, directive, Directive, DirectiveParameters } from 'lit/directive.js';
import { ActionHandlerDetail, ActionHandlerOptions } from 'custom-card-helpers/dist/types';
import { fireEvent } from 'custom-card-helpers';
import { ActionHandlerElement } from '../types/room-card-types';

const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

declare global {
  interface HASSDomEvents {
    action: ActionHandlerDetail;
  }
}

class ActionHandler extends HTMLElement implements ActionHandler {
  public holdTime = 500;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public ripple: any;

  protected timer?: number;

  protected held = false;

  private cancelled = false;

  // Suppress synthetic mouse events that browsers fire after a touch tap.
  private ignoreMouseUntil = 0;

  private dblClickTimeout?: number;

  constructor() {
    super();
    this.ripple = document.createElement('mwc-ripple');
  }

  public connectedCallback(): void {
    Object.assign(this.style, {
      position: 'absolute',
      width: isTouch ? '100px' : '50px',
      height: isTouch ? '100px' : '50px',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
      zIndex: '999',
    });

    this.appendChild(this.ripple);
    this.ripple.primary = true;

    ['touchcancel', 'mouseout', 'mouseup', 'touchmove', 'mousewheel', 'wheel', 'scroll'].forEach((ev) => {
      document.addEventListener(
        ev,
        () => {
          this.cancelled = true;
          if (this.timer) {
            clearTimeout(this.timer);
            this.stopAnimation();
            this.timer = undefined;
          }
        },
        { passive: true },
      );
    });
  }

  public bind(element: ActionHandlerElement, options: ActionHandlerOptions = {}): void {
    if (
      element.actionHandler &&
      element.actionHandler.options?.hasHold === options.hasHold &&
      element.actionHandler.options?.hasDoubleClick === options.hasDoubleClick
    ) {
      return;
    }

    if (element.actionHandler) {
      element.removeEventListener('touchstart', element.actionHandler.start!);
      element.removeEventListener('touchend', element.actionHandler.end!);
      element.removeEventListener('touchcancel', element.actionHandler.end!);
      element.removeEventListener('mousedown', element.actionHandler.start!);
      element.removeEventListener('click', element.actionHandler.end!);
      element.removeEventListener('keyup', element.actionHandler.handleKeyUp!);
    } else {
      element.addEventListener('contextmenu', (ev: Event) => {
        const e = ev || window.event;
        if (e.preventDefault) {
          e.preventDefault();
        }
        if (e.stopPropagation) {
          e.stopPropagation();
        }
        e.cancelBubble = true;
        e.returnValue = false;
        return false;
      });
    }

    element.actionHandler = { options };

    element.actionHandler.start = (ev: Event): void => {
      // Ignore compatibility mouse events after a touch interaction.
      if (ev.type === 'mousedown' && Date.now() < this.ignoreMouseUntil) {
        return;
      }

      this.cancelled = false;
      this.held = false;

      let x: number;
      let y: number;
      if ((ev as TouchEvent).touches) {
        x = (ev as TouchEvent).touches[0].pageX;
        y = (ev as TouchEvent).touches[0].pageY;
      } else {
        x = (ev as MouseEvent).pageX;
        y = (ev as MouseEvent).pageY;
      }

      // Only arm hold when the entity actually has a hold action.
      if (options.hasHold) {
        this.timer = window.setTimeout(() => {
          this.startAnimation(x, y);
          this.held = true;
        }, this.holdTime);
      }
    };

    element.actionHandler.end = (ev: Event): void => {
      // Ignore compatibility mouse click after a touch tap/cancel.
      if (ev.type === 'click' && Date.now() < this.ignoreMouseUntil) {
        return;
      }

      // Abort touch gestures that moved/scrolled (cancelled via document listeners).
      if (ev.type === 'touchcancel' || (ev.type === 'touchend' && this.cancelled)) {
        this.ignoreMouseUntil = Date.now() + 350;
        return;
      }

      if (ev.cancelable) {
        ev.preventDefault();
      }

      if (ev.type === 'touchend' || ev.type === 'touchcancel') {
        this.ignoreMouseUntil = Date.now() + 350;
      }

      if (options.hasHold) {
        clearTimeout(this.timer);
        this.stopAnimation();
        this.timer = undefined;
      }

      if (options.hasHold && this.held) {
        fireEvent(element, 'action', { action: 'hold' });
      } else if (options.hasDoubleClick) {
        if ((ev.type === 'click' && (ev as MouseEvent).detail < 2) || !this.dblClickTimeout) {
          this.dblClickTimeout = window.setTimeout(() => {
            this.dblClickTimeout = undefined;
            fireEvent(element, 'action', { action: 'tap' });
          }, 250);
        } else {
          clearTimeout(this.dblClickTimeout);
          this.dblClickTimeout = undefined;
          fireEvent(element, 'action', { action: 'double_tap' });
        }
      } else {
        fireEvent(element, 'action', { action: 'tap' });
      }
    };

    element.actionHandler.handleKeyUp = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Enter' && ev.keyCode !== 13) {
        return;
      }
      element.actionHandler!.end!(ev);
    };

    element.addEventListener('touchstart', element.actionHandler.start, { passive: true });
    element.addEventListener('touchend', element.actionHandler.end);
    element.addEventListener('touchcancel', element.actionHandler.end);

    element.addEventListener('mousedown', element.actionHandler.start, { passive: true });
    element.addEventListener('click', element.actionHandler.end);

    element.addEventListener('keyup', element.actionHandler.handleKeyUp);
  }

  private startAnimation(x: number, y: number): void {
    Object.assign(this.style, {
      left: `${x}px`,
      top: `${y}px`,
      display: null,
    });
    this.ripple.disabled = false;
    this.ripple.active = true;
    this.ripple.unbounded = true;
  }

  private stopAnimation(): void {
    this.ripple.active = false;
    this.ripple.disabled = true;
    this.style.display = 'none';
  }
}

customElements.define('action-handler-roomcard', ActionHandler);

const getActionHandler = (): ActionHandler => {
  const body = document.body;
  if (body.querySelector('action-handler-roomcard')) {
    return body.querySelector('action-handler-roomcard') as ActionHandler;
  }

  const actionhandler = document.createElement('action-handler-roomcard');
  body.appendChild(actionhandler);

  return actionhandler as ActionHandler;
};

export const actionHandlerBind = (element: ActionHandlerElement, options?: ActionHandlerOptions): void => {
  const actionhandler: ActionHandler = getActionHandler();
  if (!actionhandler) {
    return;
  }
  actionhandler.bind(element, options);
};

export const actionHandler = directive(
  class extends Directive {
    update(part: AttributePart, [options]: DirectiveParameters<this>) {
      actionHandlerBind(part.element as ActionHandlerElement, options);
      return noChange;
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
    render(_options?: ActionHandlerOptions) {}
  },
);
