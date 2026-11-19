#!/usr/bin/env node
// sahna: one CLI for animated-web-deck projects. `sahna --help`, or `sahna` alone for the menu.
import { main } from "../lib/cli.js";

process.exitCode = await main(process.argv.slice(2));
