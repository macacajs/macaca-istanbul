const exec = () => {
  console.log('exec', new Date());
};
if (true) {
  console.log(1);
} else {
  console.log(2);
}

document.querySelector('#test').addEventListener('click', () => {
  exec();
});
