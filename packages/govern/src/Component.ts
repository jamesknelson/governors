import { Governable, GovernableClass } from './StoreGovernor'
import { ComponentState } from './Core'
import { ComponentImplementation, ComponentImplementationLifecycle } from './ComponentImplementation'
import { GovernElement } from './Element'
import { Target } from './Target'
import { Dispatcher } from './Dispatcher';

export type ElementType<T extends Component<any, any, any>> = {
    new (props: T['props']): T
    defaultProps?: Partial<T['props']>;
}

export interface ComponentClass<Value, Props> extends GovernableClass<Value, Props> {
    new (props: Props): Component<Props, ComponentState, Value>;
    defaultProps?: Partial<Props>;
    displayName?: string;
}

export interface ComponentLifecycle<Props={}, State={}, Value=any, Subs=any> {
    constructor: Function & {
        getDerivedStateFromProps?(nextProps: Props, prevState: State): State extends object ? (Partial<State> | null) : any;
    }

    UNSAFE_componentWillReceiveProps?(nextProps: Props): void;

    render(): GovernElement<Subs, any> | null;

    shouldComponentUpdate?(nextProps?: Props, nextState?: State): boolean;
    
    // These lifecycle methods will be called after other Govern components have
    // received a published value, but before the update is flushed to the UI.
    // 
    // They can be used in a similar way to a theoretical
    // `componentWillReceiveSubs`. I've opted for this method instead, as it
    // is more obvious that an unguarded `setState` will cause an infinite
    // loop.
    componentDidUpdate?(prevProps?: Props, prevState?: State, prevSubs?: Subs): void;
    componentDidInstantiate?(): void;
    
    componentWillBeDisposed?(): void;
}

export interface Component<Props={}, State={}, Value=any, Subs=any> extends ComponentLifecycle<Props, State, Value, Subs> { }

type SubscribeType<T> = T extends (...args: any[]) => GovernElement<infer R, any> ? R : never;

export abstract class Component<Props, State={}, Value=any, Subs=any> implements Governable<Value, Props>, ComponentLifecycle<Props, State, Value, Subs> {
    protected impl: ComponentImplementation<Props, State, Value, Subs>;

    constructor(props: Props) {
        this.impl = new ComponentImplementation(this, props)
    }

    get props() {
        return (this.impl.getFix().props || {}) as Props
    }

    get subs(): SubscribeType<this["render"]> {
        if (this.impl.isRunningSubscribe) {
            throw new Error(`You cannot access a component's "subs" property within its "subscribe" method. See component "${getDisplayName(this.constructor)}".`)
        }
        return this.impl.getFix().subs as any
    }

    get state() {
        return this.impl.getFix().state
    }

    set state(state: State) {
        if (this.impl.emitter) {
            throw new Error(`You cannot set a component's state directly outside of the constructor. See component "${getDisplayName(this.constructor)}".`)
        }

        this.impl.state = state
    }

    setState<K extends keyof State>(
        state: ((prevState: Readonly<State>, props: Props) => (Pick<State, K> | State)) | (Pick<State, K> | State),
        callback?: () => void
    ): void {
        if (!this.impl.emitter) {
            throw new Error(`You cannot call "setState" within a component's constructor. Instead, set the "state" property directly. See component "${getDisplayName(this.constructor)}".`)
        }
        if (this.impl.isDisposed) {
            console.error(`You cannot call "setState" on a component that has already been disposed. Treating as a noop.`)
            return
        }

        let updater = state as ((prevState: Readonly<State>, props: Props) => any)
        if (typeof state !== 'function') {
            updater = () => state
        }
        this.impl.setState(updater, callback)
    }

    dispatch(action: () => void): void {
        this.impl.emitter.dispatcher.enqueueAction(action)
    }

    createStoreGovernor(dispatcher: Dispatcher) {
        return this.impl.createStoreGovernor(dispatcher)
    }

    shouldComponentPublish(prevProps, prevState, prevSubs) {
        return this.subs === undefined || this.subs !== prevSubs
    }
}

export function getDisplayName(componentClass) {
    return componentClass.displayName || componentClass.name
}
