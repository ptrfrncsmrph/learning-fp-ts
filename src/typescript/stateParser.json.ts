import * as A from "fp-ts/lib/Array"
import { pipe } from "fp-ts/lib/pipeable"
import { flow, tuple } from "fp-ts/lib/function"
import * as O from "fp-ts/lib/Option"
import Option = O.Option
import * as E from "fp-ts/lib/Either"
import * as Tu from "fp-ts/lib/Tuple"
import * as StT from "fp-ts/lib/StateT"
import { Monad3 } from "fp-ts/lib/Monad"
import { Alt3 } from "fp-ts/lib/Alt"

type JSONValue =
  | { tag: "Null" }
  | { tag: "Boolean"; contents: boolean }
  | { tag: "Number"; contents: number }
  | { tag: "String"; contents: string }
  | { tag: "Array"; contents: Array<JSONValue> }
  | { tag: "Object"; contents: Record<string, JSONValue> }

type Input = {
  loc: number
  str: string
}

const inputUncons: (
  input: Input
) => Option<[string, Input]> = input =>
  input.str.length === 0
    ? O.none
    : O.some([
        input.str[0],
        { loc: input.loc + 1, str: input.str.slice(1) },
      ])

declare module "fp-ts/lib/HKT" {
  interface URItoKind3<R, E, A> {
    readonly StateEither: StateEither<R, E, A>
  }
}

export const URI = "StateEither"

export type URI = typeof URI

type StateEither<I, E, A> = StT.StateT2<E.URI, I, E, A>

const stateEither: Monad3<URI> & Alt3<URI> = {
  URI,
  ...StT.getStateM(E.either),
  alt: (fa, that) => input =>
    pipe(
      fa(input),
      E.fold(
        () => that()(input),
        x => E.right(x)
      )
    ),
}

type Parser<A> = StateEither<Input, Error, A>

const charP: (char: string) => Parser<string> = char => input =>
  pipe(
    input,
    inputUncons,
    O.fold(
      () =>
        E.left(Error(`Expected '${char}', but reached end of input`)),
      ([y, ys]) =>
        char === y
          ? E.right(tuple(char, ys))
          : E.left(Error(`Expected '${char}', but found '${y}'`))
    )
  )

const stringP: (str: string) => Parser<string> = str => input =>
  pipe(
    input,
    pipe([...str], A.traverse(stateEither)(charP)),
    E.fold(
      () =>
        E.left(Error(`Expected '${str}', but found '${input.str}'`)),
      ([chars, input_]) => E.right([chars.join(""), input_])
    )
  )

const jsonNull: Parser<JSONValue> = flow(
  stringP("null"),
  E.map(Tu.map(() => ({ tag: "Null" })))
)

const jsonBool: Parser<JSONValue> = input => {
  const parseTrue: Parser<JSONValue> = flow(
    stringP("true"),
    E.map(Tu.map(() => ({ tag: "Boolean", contents: true })))
  )
  const parseFalse: Parser<JSONValue> = flow(
    stringP("false"),
    E.map(Tu.map(() => ({ tag: "Boolean", contents: false })))
  )

  return pipe(
    input,
    stateEither.alt(parseTrue, () => parseFalse)
  )
}

const mkInput = (str: string): Input => ({ loc: 0, str })

console.log(pipe("true", mkInput, jsonBool))
