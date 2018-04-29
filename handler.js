const rp = require('request-promise')
const cheerio = require('cheerio')
const ProgressBar = require('progress')
const chalk = require('chalk')
const fs = require('fs')
const path = require('path')

const DEFAULT_COUNT = 50

const URL = {
  IMDB: `http://api.douban.com/v2/movie/top250`,
  SHOW_THEATERS: `http://api.douban.com/v2/movie/in_theaters?count=${DEFAULT_COUNT}`,
  COMING_SOON: `http://api.douban.com/v2/movie/coming-soon?count=${DEFAULT_COUNT}`
}

const bar = new ProgressBar(`进度 [:bar] ${chalk.yellowBright(':percent')}${chalk.yellow(' / :total%')} ${chalk.yellow(':info')} `, {
  complete: '=',
  incomplete: ' ',
  head: '>',
  total: 100,
  width: 100,
  clear: true
})

const show = async (ctx) => {
  const jsonString = await rp(`${ctx.now ? URL.SHOW_THEATERS : URL.COMING_SOON }`)
  if (ctx.now) {

  } else if (ctx.soon) {
    console.log('list soon')
  }
}

const imdb = async (count = DEFAULT_COUNT, start, ctx) => {
  const times = Math.ceil(count / 100)
  const orginStart = Number(start)
  const imdbMovies = []
  bar.tick(10, { info: '获取 IMDB 数据...' })
  while (count >= 0) {
    const jsonString = await rp(`${URL.IMDB}?start=${start}&count=${count}`)
    bar.tick(Math.ceil(40 / times))
    imdbMovies.push(...JSON.parse(jsonString).subjects)
    start += 100
    count -= 100
  }
  bar.tick(10, { info: '加工 IMDB 数据...' })
  const imdbInfo = imdbMovies.map((movie, index) => {
    const { genres, title, original_title, year } = movie
    return {
      average_rating: movie.rating.average,
      image: movie.images.length === 0 ? null : movie.images.medium,
      rank: orginStart + index + 1,
      genres,
      title,
      original_title,
      year,
      directors: movie.directors.map(director => { return director.name }),
      casts: movie.casts.map(cast => { return cast.name })
    }
  })
  bar.tick(20, { info: '加工 IMDB 数据完毕' })
  bar.tick(10, { info: '转换 IMDB 数据...' })
  const print = imdbInfo.map(movie => {
    if (ctx.parent.file) {
      return `### ${movie.rank}  ${movie.title}   ${movie.original_title}\n![${movie.title}](${movie.image})\n- **评 分：** ${movie.average_rating}\n- **年 份：** ${movie.year}\n- **题 材：** ${movie.genres.join('  ')}\n- **导 演：** ${movie.directors.join('  ')}\n- **演 员：** ${movie.casts.join('  ')}\n\n\n\n`
    }
    return `
      ${chalk.bold.keyword('wheat')('IMDB 排名')} - ${chalk.bold.keyword('skyblue')(movie.rank)}
        ${chalk.bold.keyword('wheat')('标   题')} - ${chalk.bold.keyword('skyblue')(movie.title)} ${chalk.bold.keyword('skyblue')(movie.original_title)}
        ${chalk.bold.keyword('wheat')('年   份')} - ${chalk.bold.keyword('skyblue')(movie.year)}
        ${chalk.bold.keyword('wheat')('评   分')} - ${chalk.bold.keyword('skyblue')(movie.average_rating)}
        ${chalk.bold.keyword('wheat')('题   材')} - ${chalk.bold.keyword('skyblue')(movie.genres.join('  '))}
        ${chalk.bold.keyword('wheat')('封   面')} - ${chalk.bold.keyword('skyblue')(movie.image)}
        ${chalk.bold.keyword('wheat')('导   演')} - ${chalk.bold.keyword('skyblue')(movie.directors.join('  '))}
        ${chalk.bold.keyword('wheat')('演   员')} - ${chalk.bold.keyword('skyblue')(movie.casts.join('  '))}
    `
  })
  if (ctx.parent.file) {
    return fs.writeFile(ctx.parent.file, print.join('\n\n'), 'utf-8', (err) => {
      if (err) throw err
      else bar.tick(10, { info: '转换 IMDB 数据完毕，已输出到文件中' })
      console.log(`数据已经输出在 ${chalk.underline.bold.red(path.resolve(process.cwd(), ctx.parent.file))}`)
    })
  }
  bar.tick(10, { info: '转换 IMDB 数据完毕，准备打印...' })
  print.forEach(item => {
    console.log(item)
    console.log('')
  })
}

const summary = (year) => {
  console.log(year)
}

const search = (query, ctx) => {
  if (query) {
    console.log(query)
  } else {
    if (ctx.movie) {
      console.log('movie')
    } else if (ctx.star) {
      console.log('star')
    } else if (ctx.tag) {
      console.log('tag')
    }
  }
}

exports.show = show
exports.imdb = imdb
exports.summary = summary
exports.search = search
