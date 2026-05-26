# anaemia

a work in progress high-performance SolidJS SSR framework built for large codebases ([such as bojanSocial](https://bojan.social))

## architecture and the why?

anaemia uses ByteDance's [Rspack](https://rspack.dev) as it's bundler due to performance benefits over Vite and issues that come with using it at scale,

- bojanSocial's web frontend is comprised with tons of components (100+) and over 100,000 lines of code. This is an issue with Vite's ES module based system due to fact it has to load tons of JavaScript for the initial page load

- We abuse CSS modules (a ton) - every page on bojanSocial uses CSS modules with SCSS. 

This is pretty bad as the browser has to send tons of requests just to get a home page. This is the network-dependency tree just for the index page alone on desktop (with lazy-loading)

![It's pretty bad](docs/images/why-1.png "network-dependency tree")