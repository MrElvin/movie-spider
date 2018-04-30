const rp = require('request-promise')
const cheerio = require('cheerio')
const ProgressBar = require('progress')
const chalk = require('chalk')
const fs = require('fs')
const path = require('path')
const util = require('util')

const DEFAULT_COUNT = 50

const URL = {
  IMDB: `http://api.douban.com/v2/movie/top250`,
  SHOW_THEATERS: `http://api.douban.com/v2/movie/in_theaters?count=${DEFAULT_COUNT}`,
  COMING_SOON: `http://api.douban.com/v2/movie/coming_soon?count=${DEFAULT_COUNT}`,
  MOVIE: `https://movie.douban.com/subject/`
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
  bar.tick(10, { info: '获取豆瓣网接口数据...' })
  const response = await rp(`${ctx.soon ? URL.COMING_SOON : URL.SHOW_THEATERS}`)
  bar.tick(10, { info: '获取豆瓣网接口数据成功' })
  bar.tick(5, { info: '筛选高评分电影...' })
  const moviesInTheaterOriginal = JSON.parse(response).subjects.map(movie => {
    const { genres, title, original_title, alt, id } = movie
    return {
      average_rating: movie.rating.average,
      genres: genres.join(' / '),
      title,
      original_title,
      alt,
      id,
      image: movie.images.medium
    }
  })
  const moviesInTheater = moviesInTheaterOriginal.filter(movie => { return (Number(movie.average_rating) >= 6) })
  bar.tick(5, { info: '筛选高评分电影成功' })
  const htmlPromises = moviesInTheater.map(async movie => await rp(movie.alt))
  bar.tick(10, { info: '获取每部高评分电影详细信息...' })
  for (let index = 0; index < htmlPromises.length; index++) {
    const htmlString = await htmlPromises[index]
    let $ = cheerio.load(htmlString)
    const actors = $('span.actor .attrs').text()
    const directors = $('a[rel="v:directedBy"]').text()
    const releaseDate = $('span[property="v:initialReleaseDate"]').text()
    const runtime = $('span[property="v:runtime"]').text()
    const buyLink = ctx.now ? decodeURIComponent($('a.ticket-btn').attr('href').split('url=')[1]) : ''
    const summary = $('span[property="v:summary"]').text().split('\n').map(string => string.trim()).filter(string => string !== '')
    const roleList = Array.from($('.celebrities-list .celebrity').map((index, celebrity) => {
      return {
        name: $(celebrity).find('span.name').text(),
        role: $(celebrity).find('span.role').text()
      }
    }))
    if (!ctx.soon) {
      try {
        const commentHtmlString = await rp(`${URL.MOVIE}${moviesInTheater[index].id}/comments`)
        $ = cheerio.load(commentHtmlString)
        const comments = Array.from($('.comment-item').map((index, comment) => {
          return {
            commentTime: $(comment).find('span.comment-time').text().replace(/^\s+|\s+$/g, ''),
            commentUser: $(comment).find('span.comment-info a').text(),
            commentDetail: $(comment).find('div.comment p').text().replace(/^\s+|\s+$/g, ''),
            commentVote: $(comment).find('.comment-vote span.votes').text().replace(/^\s+|\s+$/g, '')
          }
        })).slice(0, 10)
        Object.assign(moviesInTheater[index], { actors, directors, releaseDate, runtime, buyLink, summary, roleList, comments })
      } catch (err) {
        continue;
      }
    }
    Object.assign(moviesInTheater[index], { actors, directors, releaseDate, runtime, buyLink, summary, roleList })
    bar.tick(Math.ceil(40 / htmlPromises.length))
  }
  bar.tick(5, { info: '格式化内容...' })
  const print = moviesInTheater.map(movie => {
    return `
![${movie.title}](${movie.image})
### ${movie.title}           ${movie.average_rating}
##### ${movie.original_title}
- 导演： ${movie.directors !== '' ? movie.directors : '暂无信息'}
- 主演： ${movie.actors !== '' ? movie.actors : '暂无信息'}
- 类型： ${movie.genres}
- 上映日期： ${movie.releaseDate !== '' ? movie.releaseDate : '暂无信息'}
- 影片时长： ${movie.runtime !== '' ? movie.runtime : '暂无信息'}
- 剧情简介：${movie.summary ? '\n' + movie.summary.join('\n') : '暂无信息'}
- 演职员表：${movie.roleList ? '\n' + movie.roleList.filter(role => role.role !== '').map((role, index) => `  - **${role.name}**    ${role.role}\n\n`).join('') : '暂无信息'}
${ctx.now ? `- 网友热评：${movie.comments !== undefined ? '\n' + movie.comments.map((comment, index) => `> **${index + 1}   ${comment.commentUser}**         ${comment.commentTime}        ${comment.commentVote}\n> ${comment.commentDetail}\n\n`).join('') : '暂无评论'}` : ''}
${ctx.now ? `- 购票链接： [${movie.title}](${movie.buyLink})` : ''}
      `
    })
  bar.tick(5, { info: '格式化内容成功，准备写入' })
  if (ctx.parent.file) {
    return fs.writeFile(ctx.parent.file, print.join('\n\n'), 'utf-8', (err) => {
      if (err) throw err
      else {
        bar.tick(10, { info: '内容写入成功' })
        console.log(`数据已经输出在 ${chalk.underline.bold.red(path.resolve(process.cwd(), ctx.parent.file))}`)
      }
    })
  } else {
    bar.tick(10, { info: '内容写入成功' })
    print.forEach(item => {
      console.log(item)
      console.log('')
    })
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
